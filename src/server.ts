// package.json dependencies needed:
// npm install express mysql2 cors helmet dotenv
// npm install -D @types/express @types/node @types/cors typescript ts-node nodemon

import express, { Request, Response, NextFunction } from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Add this function before your dbConfig object (around line 18)
function parseDatabaseUrl(url: string) {
  const urlObj = new URL(url);
  return {
    host: urlObj.hostname,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1), // Remove leading slash
    port: parseInt(urlObj.port)
  };
}

// Replace your existing dbConfig object (around line 20-26) with this:
const dbConfig = process.env.DATABASE_URL 
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'nahcongov_contacts23',
      port: parseInt(process.env.DB_PORT || '3306')
    };

// Add connection logging and testing
console.log('Database configuration:', {
  ...dbConfig,
  password: '[HIDDEN]' // Don't log the actual password
});

// Create database connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection function
async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    
    // Test a simple query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Database query test passed:', rows);
    
    connection.release();
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error code:', error.code);
    return false;
  }
}

// Interfaces matching your React Native structure
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// You'll also need this interface if not already defined
interface ContactQueryParams {
  search?: string;
  location?: string;
  province?: string;
  state?: string;
  category?: string;
  limit?: string;
  offset?: string;
}

interface Contact {
  id: string;
  name: string;
  location: string;
  phone: string;
  whatsapp: string;
  rank: string;
  province: string;
  state: string;
  category: string;
}

// Helper function to get location name from various category tables
async function getLocationName(
  locationId: number,
  mkCatId: number,
  mdCatId: number,
  muasCatId: number,
  nrtCatId: number,
  fieldCatId: number,
  medicalCatId: number,
  serviceCatId: number
): Promise<string> {
  try {
    // Check location table first
    if (locationId > 0) {
      const [locationRows] = await pool.execute(
        'SELECT location FROM location WHERE location_id = ?',
        [locationId]
      );
      if (Array.isArray(locationRows) && locationRows.length > 0) {
        return (locationRows[0] as any).location;
      }
    }

    // Check specific category tables based on non-zero IDs
    if (mkCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT mk_category FROM mk_cat_info WHERE mk_cat_id = ?',
        [mkCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).mk_category;
      }
    }

    if (mdCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT md_category FROM md_cat_info WHERE md_cat_id = ?',
        [mdCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).md_category;
      }
    }

    if (muasCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT muas_category FROM muas_cat_info WHERE muas_cat_id = ?',
        [muasCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).muas_category;
      }
    }

    if (nrtCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT nrt_category FROM nrt_cat_info WHERE nrt_cat_id = ?',
        [nrtCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).nrt_category;
      }
    }

    if (fieldCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT field_category FROM field_cat_info WHERE field_cat_id = ?',
        [fieldCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).field_category;
      }
    }

    if (medicalCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT medical_category FROM medical_cat_info WHERE medical_cat_id = ?',
        [medicalCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).medical_category;
      }
    }

    if (serviceCatId > 0) {
      const [rows] = await pool.execute(
        'SELECT service_category FROM service_cat_info WHERE service_cat_id = ?',
        [serviceCatId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return (rows[0] as any).service_category;
      }
    }

    return 'Unknown';
  } catch (error) {
    console.error('Error getting location name:', error);
    return 'Unknown';
  }
}

// Format phone number to include WhatsApp format
function formatWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If it starts with 0, replace with 234 (Nigeria country code)
  if (cleaned.startsWith('0')) {
    return '234' + cleaned.substring(1);
  }
  
  // If it doesn't start with 234, add it
  if (!cleaned.startsWith('234')) {
    return '234' + cleaned;
  }
  
  return cleaned;
}

// Main API endpoint to get all contacts - FIXED VERSION
app.get('/api/contacts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, location, province, state, category } = req.query as ContactQueryParams;
    
    // Safely parse limit and offset with proper integer conversion
    const limitParam = req.query.limit as string;
    const offsetParam = req.query.offset as string;
    
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10))) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;
    
    // Ensure they are valid numbers
    if (isNaN(limit) || isNaN(offset)) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid limit or offset parameters' 
      });
      return;
    }
    
    console.log('Query params:', { search, location, province, state, category, limit, offset });
    
    let query = `
      SELECT 
        pr.record_id,
        pr.rank,
        pr.f_name,
        pr.l_name,
        pr.phone,
        pr.phone1,
        pr.phone2,
        pr.location_id,
        pr.mk_cat_id,
        pr.md_cat_id,
        pr.muas_cat_id,
        pr.nrt_cat_id,
        pr.field_cat_id,
        pr.medical_cat_id,
        pr.service_cat_id,
        pr.province_id,
        pr.state_id,
        p.province,
        s.state_name
      FROM phone_record pr
      LEFT JOIN province_info p ON pr.province_id = p.province_id
      LEFT JOIN state_info s ON pr.state_id = s.state_id
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    
    // Add search filter
    if (search && search.trim()) {
      query += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    // Add province filter
    if (province && province.trim()) {
      query += ` AND p.province LIKE ?`;
      queryParams.push(`%${province.trim()}%`);
    }
    
    // Add state filter
    if (state && state.trim()) {
      query += ` AND s.state_name LIKE ?`;
      queryParams.push(`%${state.trim()}%`);
    }
    
    // Add location filter based on category
    if (location && location.trim()) {
      query += ` AND pr.location_id = (SELECT location_id FROM location WHERE location LIKE ? LIMIT 1)`;
      queryParams.push(`%${location.trim()}%`);
    }
    
    // First, let's try without LIMIT/OFFSET in prepared statement
    // We'll use string interpolation for LIMIT/OFFSET as they must be integers
    const finalQuery = query + ` LIMIT ${limit} OFFSET ${offset}`;
    
    console.log('Final query:', finalQuery);
    console.log('Query params:', queryParams);
    console.log('Param types:', queryParams.map(p => typeof p));
    
    const [rows] = await pool.execute(finalQuery, queryParams);
    
    if (!Array.isArray(rows)) {
      res.status(500).json({ error: 'Invalid database response' });
      return;
    }
    
    console.log(`Found ${rows.length} rows`);
    
    // If no data found, return empty array
    if (rows.length === 0) {
      res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      });
      return;
    }
    
    // Transform data to match React Native interface
    const contacts: Contact[] = await Promise.all(
      rows.map(async (row: any) => {
        const locationName = await getLocationName(
          row.location_id || 0,
          row.mk_cat_id || 0,
          row.md_cat_id || 0,
          row.muas_cat_id || 0,
          row.nrt_cat_id || 0,
          row.field_cat_id || 0,
          row.medical_cat_id || 0,
          row.service_cat_id || 0
        );
        
        const fullName = `${row.f_name || ''} ${row.l_name || ''}`.trim();
        const primaryPhone = row.phone || row.phone1 || row.phone2 || '';
        
        return {
          id: row.record_id.toString(),
          name: fullName || 'Unknown',
          location: locationName,
          phone: primaryPhone,
          whatsapp: formatWhatsAppNumber(primaryPhone),
          rank: row.rank || '',
          province: row.province || '',
          state: row.state_name || '',
          category: locationName
        };
      })
    );
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM phone_record pr
      LEFT JOIN province_info p ON pr.province_id = p.province_id
      LEFT JOIN state_info s ON pr.state_id = s.state_id
      WHERE 1=1
    `;
    
    const countParams: any[] = [];
    
    if (search && search.trim()) {
      countQuery += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (province && province.trim()) {
      countQuery += ` AND p.province LIKE ?`;
      countParams.push(`%${province.trim()}%`);
    }
    
    if (state && state.trim()) {
      countQuery += ` AND s.state_name LIKE ?`;
      countParams.push(`%${state.trim()}%`);
    }
    
    if (location && location.trim()) {
      countQuery += ` AND pr.location_id = (SELECT location_id FROM location WHERE location LIKE ? LIMIT 1)`;
      countParams.push(`%${location.trim()}%`);
    }
    
    const [countRows] = await pool.execute(countQuery, countParams);
    const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;
    
    res.json({
      success: true,
      data: contacts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + contacts.length < total
      }
    });
    
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Alternative implementation using query method instead of execute for LIMIT/OFFSET
app.get('/api/contacts-alt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, location, province, state, category } = req.query as ContactQueryParams;
    
    const limitParam = req.query.limit as string;
    const offsetParam = req.query.offset as string;
    
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10))) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;
    
    if (isNaN(limit) || isNaN(offset)) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid limit or offset parameters' 
      });
      return;
    }
    
    let query = `
      SELECT 
        pr.record_id,
        pr.rank,
        pr.f_name,
        pr.l_name,
        pr.phone,
        pr.phone1,
        pr.phone2,
        pr.location_id,
        pr.mk_cat_id,
        pr.md_cat_id,
        pr.muas_cat_id,
        pr.nrt_cat_id,
        pr.field_cat_id,
        pr.medical_cat_id,
        pr.service_cat_id,
        pr.province_id,
        pr.state_id,
        p.province,
        s.state_name
      FROM phone_record pr
      LEFT JOIN province_info p ON pr.province_id = p.province_id
      LEFT JOIN state_info s ON pr.state_id = s.state_id
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    
    // Add filters
    if (search && search.trim()) {
      query += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (province && province.trim()) {
      query += ` AND p.province LIKE ?`;
      queryParams.push(`%${province.trim()}%`);
    }
    
    if (state && state.trim()) {
      query += ` AND s.state_name LIKE ?`;
      queryParams.push(`%${state.trim()}%`);
    }
    
    if (location && location.trim()) {
      query += ` AND pr.location_id = (SELECT location_id FROM location WHERE location LIKE ? LIMIT 1)`;
      queryParams.push(`%${location.trim()}%`);
    }
    
    // Use pool.query instead of pool.execute for LIMIT/OFFSET
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    console.log('Final query:', query);
    console.log('Query params:', queryParams);
    
    const [rows] = await pool.query(query, queryParams);
    
    if (!Array.isArray(rows)) {
      res.status(500).json({ error: 'Invalid database response' });
      return;
    }
    
    console.log(`Found ${rows.length} rows`);
    
    if (rows.length === 0) {
      res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      });
      return;
    }
    
    // Transform data
    const contacts: Contact[] = await Promise.all(
      rows.map(async (row: any) => {
        const locationName = await getLocationName(
          row.location_id || 0,
          row.mk_cat_id || 0,
          row.md_cat_id || 0,
          row.muas_cat_id || 0,
          row.nrt_cat_id || 0,
          row.field_cat_id || 0,
          row.medical_cat_id || 0,
          row.service_cat_id || 0
        );
        
        const fullName = `${row.f_name || ''} ${row.l_name || ''}`.trim();
        const primaryPhone = row.phone || row.phone1 || row.phone2 || '';
        
        return {
          id: row.record_id.toString(),
          name: fullName || 'Unknown',
          location: locationName,
          phone: primaryPhone,
          whatsapp: formatWhatsAppNumber(primaryPhone),
          rank: row.rank || '',
          province: row.province || '',
          state: row.state_name || '',
          category: locationName
        };
      })
    );
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM phone_record pr
      LEFT JOIN province_info p ON pr.province_id = p.province_id
      LEFT JOIN state_info s ON pr.state_id = s.state_id
      WHERE 1=1
    `;
    
    const countParams: any[] = [];
    
    if (search && search.trim()) {
      countQuery += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (province && province.trim()) {
      countQuery += ` AND p.province LIKE ?`;
      countParams.push(`%${province.trim()}%`);
    }
    
    if (state && state.trim()) {
      countQuery += ` AND s.state_name LIKE ?`;
      countParams.push(`%${state.trim()}%`);
    }
    
    if (location && location.trim()) {
      countQuery += ` AND pr.location_id = (SELECT location_id FROM location WHERE location LIKE ? LIMIT 1)`;
      countParams.push(`%${location.trim()}%`);
    }
    
    const [countRows] = await pool.query(countQuery, countParams);
    const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;
    
    res.json({
      success: true,
      data: contacts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + contacts.length < total
      }
    });
    
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Get contact by ID - FIXED VERSION
app.get('/api/contacts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Validate ID is a number
    const contactId = parseInt(id, 10);
    if (isNaN(contactId)) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid contact ID' 
      });
      return;
    }
    
    const query = `
      SELECT 
        pr.*,
        p.province,
        s.state_name
      FROM phone_record pr
      LEFT JOIN province_info p ON pr.province_id = p.province_id
      LEFT JOIN state_info s ON pr.state_id = s.state_id
      WHERE pr.record_id = ?
    `;
    
    const [rows] = await pool.execute(query, [contactId]);
    
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ 
        success: false, 
        error: 'Contact not found' 
      });
      return;
    }
    
    const row = rows[0] as any;
    const locationName = await getLocationName(
      row.location_id || 0,
      row.mk_cat_id || 0,
      row.md_cat_id || 0,
      row.muas_cat_id || 0,
      row.nrt_cat_id || 0,
      row.field_cat_id || 0,
      row.medical_cat_id || 0,
      row.service_cat_id || 0
    );
    
    const fullName = `${row.f_name || ''} ${row.l_name || ''}`.trim();
    const primaryPhone = row.phone || row.phone1 || row.phone2 || '';
    
    const contact: Contact = {
      id: row.record_id.toString(),
      name: fullName || 'Unknown',
      location: locationName,
      phone: primaryPhone,
      whatsapp: formatWhatsAppNumber(primaryPhone),
      rank: row.rank || '',
      province: row.province || '',
      state: row.state_name || '',
      category: locationName
    };
    
    res.json({
      success: true,
      data: contact
    });
    
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get all locations for filtering
app.get('/api/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    const locations: string[] = [];
    
    // Get all location types
    const tables = [
      { table: 'location', column: 'location' },
      { table: 'mk_cat_info', column: 'mk_category' },
      { table: 'md_cat_info', column: 'md_category' },
      { table: 'muas_cat_info', column: 'muas_category' },
      { table: 'nrt_cat_info', column: 'nrt_category' },
      { table: 'field_cat_info', column: 'field_category' },
      { table: 'medical_cat_info', column: 'medical_category' },
      { table: 'service_cat_info', column: 'service_category' }
    ];
    
    for (const { table, column } of tables) {
      try {
        const [rows] = await pool.execute(`SELECT ${column} FROM ${table}`);
        if (Array.isArray(rows)) {
          rows.forEach((row: any) => {
            if (row[column] && !locations.includes(row[column])) {
              locations.push(row[column]);
            }
          });
        }
      } catch (tableError) {
        console.warn(`Error fetching from ${table}:`, tableError);
      }
    }
    
    res.json({
      success: true,
      data: locations.sort()
    });
    
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get all provinces
app.get('/api/provinces', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute('SELECT * FROM province_info ORDER BY province');
    
    res.json({
      success: true,
      data: rows
    });
    
  } catch (error) {
    console.error('Error fetching provinces:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get all states
app.get('/api/states', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute('SELECT * FROM state_info ORDER BY state_name');
    
    res.json({
      success: true,
      data: rows
    });
    
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Add a test endpoint to check if there's data in phone_record
app.get('/api/test-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const [countResult] = await pool.execute('SELECT COUNT(*) as count FROM phone_record');
    const count = Array.isArray(countResult) ? (countResult[0] as any).count : 0;
    
    const [sampleRows] = await pool.execute('SELECT * FROM phone_record LIMIT 5');
    
    res.json({
      success: true,
      phone_record_count: count,
      sample_data: sampleRows,
      tables_info: {
        location: await pool.execute('SELECT COUNT(*) as count FROM location'),
        provinces: await pool.execute('SELECT COUNT(*) as count FROM province_info'),
        states: await pool.execute('SELECT COUNT(*) as count FROM state_info')
      }
    });
    
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

// Enhanced health check endpoint with database test
app.get('/api/health', async (req: Request, res: Response): Promise<void> => {
  try {
    // Test database connection
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 as test');
    connection.release();
    
    res.json({ 
      success: true, 
      message: 'API is running',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'API is running but database connection failed',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    path: req.path 
  });
});

// Test database connection on startup
testDatabaseConnection().then((connected) => {
  if (connected) {
    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Contacts API: http://localhost:${PORT}/api/contacts`);
      console.log(`Test data: http://localhost:${PORT}/api/test-data`);
    });
  } else {
    console.error('Failed to start server due to database connection issues');
    process.exit(1);
  }
});

export default app;