require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mantenimiento_intrusion',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

app.get('/api/estado', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT (SELECT COUNT(*) FROM sistemas) AS sistemas, ' +
      '(SELECT COUNT(*) FROM tecnicos) AS tecnicos, ' +
      '(SELECT COUNT(*) FROM mantenimientos) AS mantenimientos'
    );

    res.json({ ok: true, baseDatos: process.env.DB_NAME || 'mantenimiento_intrusion', ...rows[0] });
  } catch (error) {
    console.error('Error consultando el estado de la base de datos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudo consultar la base de datos' });
  }
});

app.get('/api/sistemas', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, ubicacion, fecha_instalacion FROM sistemas ORDER BY id'
    );
    res.json({ ok: true, datos: rows });
  } catch (error) {
    console.error('Error consultando sistemas:', error.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron consultar los sistemas' });
  }
});

app.get('/api/mantenimientos', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.id, m.sistema_id, s.nombre AS sistema, s.ubicacion,
              m.tecnico_id, t.nombre AS tecnico, m.fecha_programada,
              m.realizado, m.observaciones
       FROM mantenimientos m
       JOIN sistemas s ON s.id = m.sistema_id
       LEFT JOIN tecnicos t ON t.id = m.tecnico_id
       ORDER BY m.fecha_programada DESC, m.id DESC`
    );
    res.json({ ok: true, datos: rows });
  } catch (error) {
    console.error('Error consultando mantenimientos:', error.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron consultar los mantenimientos' });
  }
});

app.post('/api/mantenimientos', async (req, res) => {
  const { sistema_id, tecnico_id = null, fecha_programada, realizado = false, observaciones = null } = req.body;

  if (!Number.isInteger(sistema_id) || !isValidDate(fecha_programada) ||
      typeof realizado !== 'boolean' ||
      (tecnico_id !== null && !Number.isInteger(tecnico_id)) ||
      (observaciones !== null && typeof observaciones !== 'string')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía sistema_id entero, fecha_programada YYYY-MM-DD y campos opcionales válidos',
    });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO mantenimientos
       (sistema_id, tecnico_id, fecha_programada, realizado, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [sistema_id, tecnico_id, fecha_programada, realizado, observaciones]
    );
    res.status(201).json({ ok: true, mensaje: 'Mantenimiento creado', id: result.insertId });
  } catch (error) {
    console.error('Error creando mantenimiento:', error.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudo crear el mantenimiento' });
  }
});

app.put('/api/mantenimientos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { sistema_id, tecnico_id, fecha_programada, realizado, observaciones } = req.body;

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, mensaje: 'El id debe ser un entero positivo' });
  }

  const updates = [];
  const values = [];

  if (sistema_id !== undefined) {
    if (!Number.isInteger(sistema_id)) {
      return res.status(400).json({ ok: false, mensaje: 'sistema_id debe ser un entero' });
    }
    updates.push('sistema_id = ?');
    values.push(sistema_id);
  }
  if (tecnico_id !== undefined) {
    if (tecnico_id !== null && !Number.isInteger(tecnico_id)) {
      return res.status(400).json({ ok: false, mensaje: 'tecnico_id debe ser un entero o null' });
    }
    updates.push('tecnico_id = ?');
    values.push(tecnico_id);
  }
  if (fecha_programada !== undefined) {
    if (!isValidDate(fecha_programada)) {
      return res.status(400).json({ ok: false, mensaje: 'fecha_programada debe tener formato YYYY-MM-DD' });
    }
    updates.push('fecha_programada = ?');
    values.push(fecha_programada);
  }
  if (realizado !== undefined) {
    if (typeof realizado !== 'boolean') {
      return res.status(400).json({ ok: false, mensaje: 'realizado debe ser true o false' });
    }
    updates.push('realizado = ?');
    values.push(realizado);
  }
  if (observaciones !== undefined) {
    if (observaciones !== null && typeof observaciones !== 'string') {
      return res.status(400).json({ ok: false, mensaje: 'observaciones debe ser texto o null' });
    }
    updates.push('observaciones = ?');
    values.push(observaciones);
  }
  if (updates.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'Envía al menos un campo para actualizar' });
  }

  try {
    values.push(id);
    const [result] = await db.execute(
      `UPDATE mantenimientos SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Mantenimiento no encontrado' });
    }
    res.json({ ok: true, mensaje: 'Mantenimiento actualizado' });
  } catch (error) {
    console.error('Error actualizando mantenimiento:', error.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar el mantenimiento' });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' });
});

async function iniciarServidor() {
  try {
    await db.query('SELECT 1');
    app.listen(port, () => {
      console.log(`API lista en http://localhost:${port}`);
    });
  } catch (error) {
    console.error('No se pudo conectar con MySQL. Verifica XAMPP y el archivo .env:', error.message);
    process.exitCode = 1;
  }
}

iniciarServidor();
