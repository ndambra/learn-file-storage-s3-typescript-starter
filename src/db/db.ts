import { Database } from "bun:sqlite";

export function newDatabase(pathToDB: string): Database {
  const db = new Database(pathToDB);
  autoMigrate(db);
  return db;
}

function autoMigrate(db: Database) {
  const userTable = `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		password TEXT NOT NULL,
		email TEXT UNIQUE NOT NULL
	);
	`;
  db.run(userTable);

  const refreshTokenTable = `
	CREATE TABLE IF NOT EXISTS refresh_tokens (
		token TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		revoked_at TIMESTAMP,
		user_id TEXT NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`;
  db.run(refreshTokenTable);

  const videoTable = `
	CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		title TEXT NOT NULL,
		description TEXT,
		thumbnail_url TEXT,
		video_url TEXT TEXT,
		user_id INTEGER,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`;
  db.run(videoTable);
}

export function reset(db: Database) {
  db.run("DELETE FROM refresh_tokens");
  db.run("DELETE FROM users");
  db.run("DELETE FROM videos");
}
