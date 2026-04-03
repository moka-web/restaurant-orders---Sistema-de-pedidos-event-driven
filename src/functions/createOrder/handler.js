import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { dynamo } from '../../lib/dynamodb.js'
import { createOrderSchema } from './schema.js'

export const handler = async (event) => {

    try {
      
      const body = JSON.parse(event.body)
      const parsed = createOrderSchema.safeParse(body)

      //valida que el body del request cumpla con el schema definido. Si no, devuelve un error 400 con los detalles de la validación
      if (!parsed.success) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: parsed.error.flatten() })
        }
      }

      //construye el objeto de la orden con un ID único, los datos validados del request, un estado inicial de 'pending' y una marca de tiempo de creación
      const order = {
        orderId: randomUUID(),
        tableId: parsed.data.tableId,
        items: parsed.data.items,
        status: 'pending',
        createdAt: new Date().toISOString()
      }

      // se envia un comando PutCommand a DynamoDB para guardar la orden en la tabla especificada por la variable de entorno ORDERS_TABLE. 
      // Si la operación es exitosa, devuelve un status 201 con el objeto de la orden creada. 
      // Si ocurre un error, se captura y se devuelve un status 500 con un mensaje de error genérico.

      await dynamo.send(new PutCommand({
        TableName: process.env.ORDERS_TABLE,
        Item: order
      }))

      return {
        statusCode: 201,
        body: JSON.stringify(order)
      }


    } catch (error) {
      console.error(error)
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      }
    }
  }