module.exports = {
  datasource: {
    provider: 'sqlite',
    url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  },
  };
  // File removed. Using classic .env and schema.prisma config.
