
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

  const client = new DynamoDBClient({})  // conexion base con aws  

  export const dynamo = DynamoDBDocumentClient.from(client) // cliente para trabajar con objetos JS en vez de los tipos de datos de DynamoDB