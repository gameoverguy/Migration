import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function createTestDB() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  console.log("Connected to MySQL");

  // await connection.query(`CREATE DATABASE IF NOT EXISTS migration_test`);
  await connection.query(`USE ${process.env.MYSQL_DB}`);

  // USERS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(150) UNIQUE,
      age INT,
      is_active TINYINT(1) DEFAULT 1,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // PROFILES
  await connection.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNIQUE,
      bio TEXT,
      avatar_url VARCHAR(255),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // CATEGORIES
  await connection.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE
    )
  `);

  // PRODUCTS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150),
      description TEXT,
      price DECIMAL(10,2),
      stock INT,
      category_id INT,
      created_at DATETIME,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // ORDERS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      status ENUM('pending','paid','shipped','cancelled'),
      total_amount DECIMAL(12,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ORDER ITEMS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_id INT,
      product_id INT,
      quantity INT,
      price DECIMAL(10,2),
      PRIMARY KEY (order_id, product_id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // TAGS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) UNIQUE
    )
  `);

  // PRODUCT TAGS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_tags (
      product_id INT,
      tag_id INT,
      PRIMARY KEY (product_id, tag_id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);

  // LOGS
  await connection.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      level VARCHAR(20),
      message TEXT,
      data BLOB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // INDEXES
  await connection.query(`CREATE INDEX idx_users_email ON users(email)`);
  await connection.query(
    `CREATE INDEX idx_products_category ON products(category_id)`,
  );

  console.log("Tables created");

  // INSERT DATA
  await connection.query(`
    INSERT INTO users (name,email,age,metadata)
    VALUES
    ('Alice','alice@test.com',28,'{"role":"admin"}'),
    ('Bob','bob@test.com',32,'{"role":"user"}'),
    ('Charlie','charlie@test.com',25,'{"role":"user"}')
  `);

  await connection.query(`
    INSERT INTO profiles (user_id,bio,avatar_url)
    VALUES
    (1,'Admin user','avatar1.png'),
    (2,'Regular user','avatar2.png')
  `);

  await connection.query(`
    INSERT INTO categories (name)
    VALUES ('Electronics'),('Books'),('Clothing')
  `);

  await connection.query(`
    INSERT INTO products (name,description,price,stock,category_id,created_at)
    VALUES
    ('Laptop','Gaming laptop',1200.00,10,1,NOW()),
    ('Novel','Fiction book',20.50,100,2,NOW()),
    ('T-Shirt','Cotton shirt',15.99,200,3,NOW())
  `);

  await connection.query(`
    INSERT INTO orders (user_id,status,total_amount)
    VALUES
    (1,'paid',1220.50),
    (2,'pending',15.99)
  `);

  await connection.query(`
    INSERT INTO order_items (order_id,product_id,quantity,price)
    VALUES
    (1,1,1,1200.00),
    (1,2,1,20.50),
    (2,3,1,15.99)
  `);

  await connection.query(`
    INSERT INTO tags (name)
    VALUES ('tech'),('sale'),('popular')
  `);

  await connection.query(`
    INSERT INTO product_tags (product_id,tag_id)
    VALUES
    (1,1),
    (1,3),
    (3,2)
  `);

  console.log("Test data inserted");

  await connection.end();
  console.log("Test database ready");
}

createTestDB().catch(console.error);
