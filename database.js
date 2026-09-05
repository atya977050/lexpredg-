const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "lexbridge.sqlite");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let SQL = null;
let db = null;

async function openDatabase() {
    if (!SQL) {
        SQL = await initSqlJs({
            locateFile: file =>
                path.join(__dirname, "node_modules", "sql.js", "dist", file)
        });
    }

    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        db = new SQL.Database();
    }

    db.run(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rooms (
            room_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_user_id) REFERENCES users(user_id)
        );

        CREATE INDEX IF NOT EXISTS
        idx_rooms_owner
        ON rooms(owner_user_id);

        CREATE TABLE IF NOT EXISTS wallets (
            wallet_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            currency TEXT NOT NULL DEFAULT 'EGP',
            available_minor INTEGER NOT NULL DEFAULT 0,
            reserved_minor INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );

        CREATE TABLE IF NOT EXISTS wallet_transactions (
            transaction_id TEXT PRIMARY KEY,
            wallet_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            direction TEXT NOT NULL,
            amount_minor INTEGER NOT NULL,
            balance_before_minor INTEGER NOT NULL,
            balance_after_minor INTEGER NOT NULL,
            reference_type TEXT,
            reference_id TEXT,
            idempotency_key TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY(wallet_id) REFERENCES wallets(wallet_id),
            FOREIGN KEY(user_id) REFERENCES users(user_id),

            CHECK(amount_minor > 0),
            CHECK(direction IN ('credit', 'debit')),
            CHECK(type IN (
                'deposit',
                'withdrawal',
                'gift',
                'gift_reward',
                'refund',
                'adjustment',
                'transfer_in',
                'transfer_out'
            ))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_wallet_transactions_idempotency
        ON wallet_transactions(user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

        CREATE INDEX IF NOT EXISTS
        idx_wallet_transactions_wallet_created
        ON wallet_transactions(wallet_id, created_at);

        CREATE INDEX IF NOT EXISTS
        idx_wallet_transactions_reference
        ON wallet_transactions(reference_type, reference_id);
    `);

    saveDatabase();

    return db;
}

function saveDatabase() {
    if (!db) {
        throw new Error("DATABASE_NOT_OPEN");
    }

    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}

module.exports = {
    openDatabase,
    saveDatabase,
    closeDatabase,
    getDBPath: () => DB_PATH
};
