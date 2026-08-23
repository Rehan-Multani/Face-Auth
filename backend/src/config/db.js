const mongoose = require('mongoose');
const env = require('./env');

/**
 * Global connection cache for serverless environments (e.g. Vercel)
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(env.MONGO_URI, opts).then((mongooseInstance) => {
      console.log(`[Database] MongoDB Connected: ${mongooseInstance.connection.host}`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error(`[Database Fatal] Could not connect to MongoDB: ${error.message}`);
    // Don't crash immediately in dev or vercel serverless handler
    if (env.NODE_ENV === 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }

  return cached.conn;
};

module.exports = connectDB;

