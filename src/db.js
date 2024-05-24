const vars = require('./vars')
const mongodb = require('mongodb')
const postgres = require('postgres')

/**
 * @returns {Promise<mongodb.MongoClient>}
 */
const connectToMongo = async () => {
  const url = [
    `mongodb://${vars.mongo.username}:`,
    `${vars.mongo.password}@`,
    `${vars.mongo.hostname}:`,
    `${vars.mongo.port}/`,
    `${vars.mongo.database}?authSource=admin`
  ].join('')
  const client = await mongodb.MongoClient.connect(url)
  return client
}

/**
 * @returns {Promise<postgres.Sql>}
 */
const connectToPostgres = async () => {
  const client = postgres({
    host: 'localhost',
    port: 40001,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres'
  })
  await client`SELECT 1`
  return client
}

module.exports = {
  connectToMongo,
  connectToPostgres
}