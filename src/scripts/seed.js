const crypto = require('crypto')
const {faker} = require('@faker-js/faker')
const db = require('../db')
const helpers = require('../helpers')
const vars = require('../vars')

/**
 * @typedef {{
 *  _id: string;
 *  _tz: Date;
 *  name: string;
 *  doc_number: string;
 * }} Customer
 */

/**
 * @typedef {{
 *  _id: string;
 *  _tz: Date;
 *  name: string;
 *  description: string;
 *  unit_price: string;
 * }} Product
 */

/**
 * @typedef {{
 *  _id: string
 *  _tz: Date
 *  customer_id: string
 *  created_at: Date
 *  canceled_at: Date
 *  status: 'budget' | 'sold' | 'delivered'
 *  _items: Array<{
 *    product_id: string
 *    quantity: number
 *  }>
 * }} Sale
 */

/** @type {import('postgres').Sql} */
let postgres = null
/** @type {import('mongodb').MongoClient} */
let mongo = null

/**
 * @returns {Promise<Customer>}
 */
const makeCustomer = async () => {
  const isLegal = Math.random() > 0.5
  const number = Buffer.from(crypto.randomUUID(), 'utf8').toString('hex').replace(/\D/g, '');
  const doc_number = isLegal
    ? number.replace(/(\d\d)(\d{3})(\d{3})(\d{4})(\d\d).*/, '$1.$2.$3.$4-$5')
    : number.replace(/(\d{3})(\d{3})(\d{3})(\d\d).*/, '$1.$2.$3-$4')
  /** @type {Customer} */
  const customer = {
    _id: crypto.randomUUID(),
    _tz: new Date(),
    doc_number,
    name: faker.company.name()
  }
  console.log(`[makeCustomer] created _id ${customer._id}`)
  return customer
}

/**
 * @returns {Promise<Product>}
 */
const makeProduct = async () => {
  /** @type {Product} */
  const result = {
    _id: crypto.randomUUID(),
    _tz: new Date(),
    name: faker.commerce.price({dec: 2, min: 50, max: 1000}),
    description: faker.commerce.productDescription(),
    unit_price: faker.commerce.price({min: 0.01, max: 9999.99})
  }
  console.log(`[makeProduct] created id ${result._id}`)
  return result
}

/** @type {Sale['status']} */
const saleStatuses = ['budget', 'sold', 'delivered']

/**
 * @param {Array<Customer>} listCustomer 
 * @param {Array<Product>} listProduct 
 * @returns {Promise<Sale>}
 */
const makeSale = async (listCustomer, listProduct) => {
  const selectedCustomer = listCustomer[Math.floor(Math.random() * listCustomer.length)]
  const randomListProductIndexes = new Set()
  while (randomListProductIndexes.size < Math.floor(Math.random() * 10 + 1)) {
    randomListProductIndexes.add(Math.floor(Math.random() * listProduct.length));
  }
  const selectedListProduct = listProduct.filter((_, index) => randomListProductIndexes.has(index))
  const isCanceledAt = Math.random() > 0.9
  const now = new Date()
  const createdAt = faker.date.between({from: '2020-01-01', to: new Date().setDate(now.getDate() - 1)})
  /** @type {Sale} */
  const result = {
    _id: crypto.randomUUID(),
    _tz: now,
    created_at: createdAt,
    canceled_at: isCanceledAt ? faker.date.between({from: createdAt.toJSON(), to: now.toJSON()}) : null,
    customer_id: selectedCustomer._id,
    status: saleStatuses[Math.floor(Math.random() * saleStatuses.length)],
    _items: selectedListProduct.map(product => ({
      product_id: product._id,
      quantity: Math.floor(Math.random() * 50) + 1,
    }))
  }
  console.log(`[makeSale] created id ${result._id} with ${result._items.length} items`)
  return result
}

/**
 * @param {() => Promise<any>} makeFn 
 * @param {number} length 
 * @returns 
 */
const bulkMake = async (makeFn, length) => {
  const consoleGroup = `[bulkMake] ${makeFn.name} for ${length} items`
  console.group(consoleGroup)
  const items = await Promise.all(Array(length).fill().map(() => makeFn()))
  console.groupEnd(consoleGroup)
  return items
}

/**
 * @returns {Promise<void>}
 */
const createTables = async () => {
  await postgres`
    CREATE TABLE IF NOT EXISTS "customer" (
      "_id"       UUID                        NOT NULL DEFAULT GEN_RANDOM_UUID(),
      "_tz"       TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      "name"      VARCHAR(200)                NOT NULL,
      "doc_number" VARCHAR(20)                NOT NULL,
      --
      PRIMARY KEY ("_id")
    );
  `
  await postgres`
    CREATE TABLE IF NOT EXISTS "product" (
      "_id"         UUID                        NOT NULL DEFAULT GEN_RANDOM_UUID(),
      "_tz"         TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      "name"        VARCHAR(200)                NOT NULL,
      "description" TEXT                        NOT NULL DEFAULT '',
      "unit_price"  FLOAT                       NOT NULL DEFAULT 0,
      --
      PRIMARY KEY ("_id")
    );
  `
  await postgres`
    CREATE TABLE IF NOT EXISTS "sale" (
      "_id"         UUID                        NOT NULL DEFAULT GEN_RANDOM_UUID(),
      "_tz"         TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      "customer_id" UUID                        NOT NULL,
      "created_at"  TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      "canceled_at" TIMESTAMP(3) WITH TIME ZONE     NULL,
      "status"      VARCHAR(20)                 NOT NULL DEFAULT 'budget',
      --
      PRIMARY KEY ("_id"),
      FOREIGN KEY ("customer_id") REFERENCES "customer" ("_id")
    );
  `
  await postgres`
    CREATE TABLE IF NOT EXISTS "sale_product" (
      "_id"        UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
      "sale_id"    UUID NOT NULL,
      "product_id" UUID NOT NULL,
      "index"      INT  NOT NULL,
      "quantity"   INT  NOT NULL,
      --
      PRIMARY KEY ("_id"),
      FOREIGN KEY ("sale_id")    REFERENCES "sale" ("_id"),
      FOREIGN KEY ("product_id") REFERENCES "product" ("_id")
    );
  `;
  console.log(`[createTables] finished`)
}

/**
 * @prop {Array<Customer>} listCustomer
 * @returns {Promise<void>}
 */
const bulkInsertCustomer = async (listCustomer) => {
  const columns = ['_id', '_tz', 'name', 'doc_number']
  for (const chunk of helpers.chunkArray(listCustomer, 50)) {
    // insert to postgres
    await postgres`INSERT INTO "customer" ${postgres(chunk, ...columns)}`
    // insert to mongo
    await mongo.db(vars.mongo.database).collection('customer').insertMany(chunk)
  }
  console.log(`[bulkInsertCustomer] finished with ${listCustomer.length}`)
}

/**
 * @prop {Array<Product>} listProduct
 * @returns {Promise<void>}
 */
const bulkInsertProduct = async (listProduct) => {
  const columns = ['_id', '_tz', 'name', 'description', 'unit_price']
  for (const chunk of helpers.chunkArray(listProduct, 50)) {
    // postgres
    await postgres`INSERT INTO "product" ${postgres(chunk, ...columns)}`
    // mongo
    await mongo.db(vars.mongo.database).collection('product').insertMany(chunk)
  }
  console.log(`[bulkInsertProduct] finished with ${listProduct.length}`)
}

/**
 * @prop {Array<Sale>} listSale
 * @returns {Promise<void>}
 */
const bulkInsertSale = async (listSale) => {
  let salesColumns = ['_id', '_tz', 'customer_id', 'created_at', 'canceled_at', 'status']
  let saleProductColumns = ['_id', 'sale_id', 'product_id', 'index', 'quantity']
  for (const chunk of helpers.chunkArray(listSale, 50)) {
    const [chunkSale, listSaleProduct] = chunk.reduce(([chunkSale, chunkSaleProduct], {_items, ...sale}) => {
      chunkSale.push(sale)
      chunkSaleProduct.push(..._items.map((item, index) => ({
        _id: crypto.randomUUID(),
        sale_id: sale._id,
        product_id: item.product_id,
        index,
        quantity: item.quantity
      })))
      return [chunkSale, chunkSaleProduct]
    }, [[], []])
    // postgres
    await postgres`INSERT INTO "sale" ${postgres(chunkSale, ...salesColumns)}`;
    // mongo
    await mongo.db(vars.mongo.database).collection('sale').insertMany(chunkSale)
    for (const chunkSaleProduct of helpers.chunkArray(listSaleProduct, 50)) {
      // postgres
      await postgres`INSERT INTO "sale_product" ${postgres(chunkSaleProduct, ...saleProductColumns)}`;
      // mongo
      await mongo.db(vars.mongo.database).collection('sale_product').insertMany(chunkSaleProduct)
    }
  }
  console.log(`[bulkInsertProduct] finished with ${listSale.length}`)
}

const clean = async () => {
  await postgres`
    DELETE FROM "sale_product";
  `;
  await postgres`
    DELETE FROM "sale";
  `;
  await postgres`
    DELETE FROM "customer";
  `;
  await postgres`
    DELETE FROM "product";
  `;
}

/**
 * @returns {Promise<void>}
 */
const main = async () => {
  // connect to databases
  [postgres, mongo] = await Promise.all([db.connectToPostgres(), db.connectToMongo()])

  // create structure on postgres (mongo don't need it)
  await createTables()

  await clean()

  // generate random entities with relationships
  /** @type {Array<Customer>} */
  const listCustomer = await bulkMake(makeCustomer, 500)
  /** @type {Array<Product>} */
  const listProduct = await bulkMake(makeProduct, 500)
  /** @type {Array<Sale>} */
  const listSale = await bulkMake(() => makeSale(listCustomer, listProduct), 500)

  // insert data to databases
  await bulkInsertCustomer(listCustomer)
  await bulkInsertProduct(listProduct)
  await bulkInsertSale(listSale)
  console.log(`[main] done`)
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })