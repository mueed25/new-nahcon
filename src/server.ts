// package.json dependencies needed:
// npm install express mysql2 cors helmet dotenv
// npm install -D @types/express @types/node @types/cors typescript ts-node nodemon

import express, { Request, Response } from 'express';
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

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nahcongov_contacts23',
  port: parseInt(process.env.DB_PORT || '3306')
};

// Create database connection pool
const pool = mysql.createPool(dbConfig);

// Interfaces matching your React Native structure
interface Contact {
  id: string;
  name: string;
  location: string;
  phone: string;
  whatsapp: string;
  rank?: string;
  category?: string;
  province?: string;
  state?: string;
}

interface ContactQueryParams {
  search?: string;
  location?: string;
  province?: string;
  state?: string;
  category?: string;
  limit?: string;
  offset?: string;
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

// Main API endpoint to get all contacts
app.get('/api/contacts', async (req: Request<{}, {}, {}, ContactQueryParams>, res: Response) => {
  try {
    const { search, location, province, state, category, limit = '50', offset = '0' } = req.query;
    
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
    if (search) {
      query += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    // Add province filter
    if (province) {
      query += ` AND p.province LIKE ?`;
      queryParams.push(`%${province}%`);
    }
    
    // Add state filter
    if (state) {
      query += ` AND s.state_name LIKE ?`;
      queryParams.push(`%${state}%`);
    }
    
    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await pool.execute(query, queryParams);
    
    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: 'Invalid database response' });
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
    
    if (search) {
      countQuery += ` AND (pr.f_name LIKE ? OR pr.l_name LIKE ? OR pr.phone LIKE ? OR pr.phone1 LIKE ? OR pr.phone2 LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (province) {
      countQuery += ` AND p.province LIKE ?`;
      countParams.push(`%${province}%`);
    }
    
    if (state) {
      countQuery += ` AND s.state_name LIKE ?`;
      countParams.push(`%${state}%`);
    }
    
    const [countRows] = await pool.execute(countQuery, countParams);
    const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;
    
    res.json({
      success: true,
      data: contacts,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + contacts.length < total
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

// Get contact by ID
app.get('/api/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
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
    
    const [rows] = await pool.execute(query, [id]);
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Contact not found' 
      });
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
app.get('/api/locations', async (req: Request, res: Response) => {
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
      const [rows] = await pool.execute(`SELECT ${column} FROM ${table}`);
      if (Array.isArray(rows)) {
        rows.forEach((row: any) => {
          if (row[column] && !locations.includes(row[column])) {
            locations.push(row[column]);
          }
        });
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
app.get('/api/provinces', async (req: Request, res: Response) => {
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
app.get('/api/states', async (req: Request, res: Response) => {
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

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Contacts API: http://localhost:${PORT}/api/contacts`);
});

export default app;