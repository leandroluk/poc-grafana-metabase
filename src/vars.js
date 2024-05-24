require('dotenv/config');

const {env: _} = process

const vars = {
  mongo: {
    hostname: _.MONGO_HOSTNAME ?? 'localhost',
    port: Number(_.MONGO_PORT ?? 40000),
    username: _.MONGO_USERNAME ?? 'mongo',
    password: _.MONGO_PASSWORD ?? 'mongo',
    database: _.MONGO_DATABASE ?? 'mongo'
  },
  postgres: {
    hostname: _.POSTGRES_HOSTNAME ?? 'localhost',
    port: Number(_.POSTGRES_PORT ?? 40001),
    username: _.POSTGRES_USERNAME ?? 'postgres',
    password: _.POSTGRES_PASSWORD ?? 'postgres',
    database: _.POSTGRES_DATABASE ?? 'postgres'
  }
}

module.exports = vars