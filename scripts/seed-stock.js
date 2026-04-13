import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ endpoint: 'http://localhost:8000' })
const dynamo = DynamoDBDocumentClient.from(client)

const STOCK_TABLE = 'stock'

const initialStock = [
  {
    itemId: 'hamburguesa-001',
    name: 'Hamburguesa Clásica',
    quantity: 50,
    threshold: 10
  },
  {
    itemId: 'pizza-001',
    name: 'Pizza Margherita',
    quantity: 30,
    threshold: 5
  },
  {
    itemId: 'ensalada-001',
    name: 'Ensalada César',
    quantity: 40,
    threshold: 8
  },
  {
    itemId: 'pasta-001',
    name: 'Spaghetti a la Bolognesa',
    quantity: 25,
    threshold: 5
  },
  {
    itemId: 'bebida-001',
    name: 'Gaseosa 500ml',
    quantity: 100,
    threshold: 20
  }
]

async function seedStock() {
  console.log('Seedando stock inicial...\n')

  for (const item of initialStock) {
    await dynamo.send(new PutCommand({
      TableName: STOCK_TABLE,
      Item: item
    }))
    console.log(`✓ ${item.name} — stock: ${item.quantity}, threshold: ${item.threshold}`)
  }

  console.log('\nSeed completado.')
}

seedStock().catch(console.error)
