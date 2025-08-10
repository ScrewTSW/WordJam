// Explicit exports for TypeScript consumers
import Database, { Database as DBInstance } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface SqliteHandlerContract {
  getDB(): DBInstance;
  close(): void;
}

class SqliteHandler implements SqliteHandlerContract {
  private db: DBInstance;

  constructor(filePath: string) {
    const fileExists = fs.existsSync(filePath);
    this.db = new Database(filePath);
    if (!fileExists) {
      this.initialize();
    }
  }

  // Initialization logic: create tables, etc.
  private initialize() {
    // Example: create a users table if not exists
    this.db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      uuid TEXT
    )`).run();

    this.db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_uuid TEXT NOT NULL,
      session_cookies TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_uuid) REFERENCES users(uuid) ON DELETE CASCADE
    )`).run();
    // Add more initialization as needed
  }

  // User methods
  registerUser(username: string, uuid: string) {
    const stmt = this.db.prepare('INSERT INTO users (username, uuid) VALUES (?, ?)');
    const info = stmt.run(username, uuid);
    return info.lastInsertRowid;
  }

  deleteUser(uuid: string) {
    const stmt = this.db.prepare('DELETE FROM users WHERE uuid = ?');
    return stmt.run(uuid);
  }

  // Session methods
  createSession(user_uuid: string, session_cookies: string) {
    const stmt = this.db.prepare('INSERT INTO sessions (user_uuid, session_cookies) VALUES (?, ?)');
    const info = stmt.run(user_uuid, session_cookies);
    return info.lastInsertRowid;
  }

  logoutSession(sessionId: number) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(sessionId);
  }

  getDB() {
    return this.db;
  }

  close() {
    this.db.close();
  }
}
export { SqliteHandler };
