const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const port = 5000; // Порт, на котором будет работать ваш бэкэнд

// Настройка CORS
app.use(cors());
app.use(express.json()); // Для парсинга JSON

// Создание подключения к MySQL
const db = mysql.createConnection({
  host: 'localhost',  // Если используете Docker, используйте имя контейнера MySQL
  user: 'your_user',
  password: 'your_password',
  database: 'your_database'
});

// Проверка подключения
db.connect((err) => {
  if (err) {
    console.error('Ошибка подключения к MySQL:', err);
    return;
  }
  console.log('Подключение к MySQL установлено.');
});

// Пример маршрута для получения данных
app.get('/routes', (req, res) => {
  const { start_stop_name, end_stop_name, date } = req.query;


  if (!start_stop_name || !end_stop_name || !date) {
    return res.status(400).json({ error: 'Both start_stop_id and end_stop_id are required.' });
  }

  const query = `SELECT 
        sr1.route_id,
        sr1.id_stop_route AS start_stop_id,
        sr2.id_stop_route AS end_stop_id,
        r.name AS route_name,
        s1.name AS start_stop_name,
        s2.name AS end_stop_name,
        sr1.departure, 
        sr2.arrival, 
        r.standard_price AS base_price,
        r.standard_price + IFNULL(SUM(sr_add.additional_price), 0) AS total_price, -- Корректный расчет total_price
        b.capacity,
        (SELECT COUNT(t2.id_ticket) -- Подзапрос для подсчета количества проданных билетов
        FROM Tickets t2
        WHERE t2.stop_from_id = sr1.id_stop_route
        AND t2.stop_to_id = sr2.id_stop_route
        AND DATE(t2.purchase_date) = '${date}') AS sold_tickets
    FROM 
        Stops_Routes sr1
    JOIN 
        Stops_Routes sr2 ON sr1.route_id = sr2.route_id 
    JOIN 
        Routes r ON sr1.route_id = r.id_route 
    JOIN 
        Buses b ON b.id_bus = r.bus_id
    JOIN 
        Stops s1 ON sr1.stop_id = s1.id_stop 
    JOIN 
        Stops s2 ON sr2.stop_id = s2.id_stop 
    LEFT JOIN 
        Stops_Routes sr_add ON sr1.route_id = sr_add.route_id 
        AND sr_add.stop_order >= sr1.stop_order 
        AND sr_add.stop_order <= sr2.stop_order 
    WHERE 
        s1.name = '${start_stop_name}' -- фильтрация по названию начальной остановки
        AND s2.name = '${end_stop_name}' -- фильтрация по названию конечной остановки
        AND sr1.stop_order < sr2.stop_order 
        AND DATE(sr1.departure) = '${date}' 
    GROUP BY 
        sr1.route_id, sr1.departure, sr2.arrival, sr1.id_stop_route, sr2.id_stop_route, b.capacity
    ORDER BY 
        sr1.departure ASC;


`

  db.query(query, [start_stop_name, end_stop_name, date], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(results);
  });
});

app.post('/addTicket', (req, res) => {
  const { stop_from_id, stop_to_id, price, purchase_date, baggage } = req.body;

  // Запрос на добавление билета в таблицу
  const query = `INSERT INTO Tickets (stop_from_id, stop_to_id, price, purchase_date, baggage) 
  VALUES (${stop_from_id}, ${stop_to_id}, ${price}, '${purchase_date}', ${baggage})`;

  // Выполнение SQL запроса
  db.query(query, [stop_from_id, stop_to_id, price, purchase_date, baggage], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при добавлении билета' });
    }
    res.status(200).json({ message: 'Билет успешно добавлен', ticketId: result.insertId });
  });
});

app.get('/drivers', (req, res) => {
  const query = `
  SELECT
  Drivers.id_driver,
  Drivers.name 
  FROM Drivers
   ORDER BY 
        id_driver DESC;
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка получения водителей' });
    }
    res.status(200).json(result);
  });
})

app.post('/addDriver', (req, res) => {
  const { name } = req.body;

  // Запрос на добавление билета в таблицу
  const query = `INSERT INTO Drivers(name) VALUES ('${name}')`;

  // Выполнение SQL запроса
  db.query(query, [name], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при добавлении водителя' });
    }
    // res.status(200).json({ message: 'Билет успешно добавлен', ticketId: result.insertId });
  });
});

app.put(`/updateDriver/:id`, (req, res) => {
  const { id } = req.params; // Получаем id из параметров URL
  const { name } = req.body; // Получаем новое имя водителя из тела запроса

  // Запрос на обновление имени водителя в таблице
  const query = `UPDATE Drivers SET name = '${name}' WHERE id_driver = ${id}`;

  // Выполнение SQL запроса
  db.query(query, [name, id], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при обновлении водителя' });
    }

    // Проверяем, обновлены ли строки
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Водитель не найден' });
    }

    res.status(200).json({ message: 'Водитель успешно обновлён' });
  });
});

app.delete(`/deleteDriver/:id`, (req, res) => {
  const { id } = req.params; // Получаем id из параметров URL

  // Запрос на обновление имени водителя в таблице
  const query = `DELETE FROM Drivers WHERE id_driver = ${id}`;

  // Выполнение SQL запроса
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при удалении водителя' });
    }

    // Проверяем, обновлены ли строки
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Водитель не найден' });
    }

    res.status(200).json({ message: 'Водитель успешно удалён' });
  });
});

app.get('/stops', (req, res) => {
  const query = `
  SELECT id_stop,name FROM Stops
   ORDER BY 
        id_stop DESC;
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка получения остановок' });
    }
    res.status(200).json(result);
  });
})

app.post('/addStop', (req, res) => {
  const { name } = req.body;

  // Запрос на добавление билета в таблицу
  const query = `INSERT INTO Stops(name) VALUES ('${name}')`;

  // Выполнение SQL запроса
  db.query(query, [name], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при добавлении остановки' });
    }
  });
});

app.put(`/updateStop/:id`, (req, res) => {
  const { id } = req.params; // Получаем id из параметров URL
  const { name } = req.body; // Получаем новое имя водителя из тела запроса

  // Запрос на обновление имени водителя в таблице
  const query = `UPDATE Stops SET name = '${name}' WHERE id_stop = ${id}`;

  // Выполнение SQL запроса
  db.query(query, [name, id], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при обновлении остановки' });
    }

    // Проверяем, обновлены ли строки
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Остановка не найдена' });
    }

    res.status(200).json({ message: 'Остановка успешно обновлёна' });
  });
});

app.delete(`/deleteStop/:id`, (req, res) => {
  const { id } = req.params; // Получаем id из параметров URL

  // Запрос на обновление имени водителя в таблице
  const query = `DELETE FROM Stops WHERE id_stop = ${id}`;

  // Выполнение SQL запроса
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка при удалении остановки' });
    }

    // Проверяем, обновлены ли строки
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Остановка не найдена' });
    }

    res.status(200).json({ message: 'Остановки успешно удалёна' });
  });
});

app.get('/tickets', (req, res) => {
  const query = `
  SELECT 
  id_ticket,	
  Routes.id_route,
  Routes.id_route AS number_route,
  s1.name AS start_stop_name,
  sr1.departure AS departure,
  s2.name AS end_stop_name,
  sr2.arrival AS arrival,
  Routes.name AS route_name,
  price,
  purchase_date,		
  baggage 
  FROM 
  Tickets INNER JOIN Stops_Routes sr1 ON Tickets.stop_from_id = sr1.id_stop_route
  INNER JOIN Stops s1 ON sr1.stop_id = s1.id_stop
  INNER JOIN Stops_Routes sr2 ON Tickets.stop_to_id = sr2.id_stop_route
  INNER JOIN Stops s2 ON sr2.stop_id = s2.id_stop
  INNER JOIN Routes ON sr1.route_id = Routes.id_route
  ORDER BY 
        id_ticket DESC;
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Ошибка выполнения запроса: ', err);
      return res.status(500).json({ error: 'Ошибка получения билетов' });
    }
    res.status(200).json(result);
  });
})

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});
