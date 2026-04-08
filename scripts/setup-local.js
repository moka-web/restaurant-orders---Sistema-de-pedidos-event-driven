import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({ endpoint: 'http://localhost:8000' })

async function createTableIfNotExists(tableName, params) {
  const { TableNames } = await client.send(new ListTablesCommand({}))

  if (TableNames.includes(tableName)) {
    console.log(`Tabla '${tableName}' ya existe, saltando...`)
    return
  }

  await client.send(new CreateTableCommand(params))
  console.log(`Tabla '${tableName}' creada exitosamente`)
}

async function setup() {
  console.log('Configurando DynamoDB local...\n')

  await createTableIfNotExists('orders', {
    TableName: 'orders',
    AttributeDefinitions: [{ AttributeName: 'orderId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST'
  })

  console.log('\nSetup completado.')
}

setup().catch(console.error)
