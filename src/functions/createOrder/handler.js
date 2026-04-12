import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { dynamo } from '../../lib/dynamodb.js'
import { createOrderSchema } from './schema.js'
import { eventbridge } from '../../lib/eventbridge.js' // el nombre del archivo tiene que ser en minúscula para que funcione la importación, aunque el nombre de la variable sea eventbridge
import { PutEventsCommand } from '@aws-sdk/client-eventbridge';


//este handler es la función principal que se ejecuta cuando se recibe una solicitud para crear una orden.
// esto es una lambda function que se ejecuta en AWS Lambda, y se espera que reciba un evento con un body que contenga los datos de la orden a crear.

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
        billingStatus: 'pending',
        createdAt: new Date().toISOString(),
      }

      // se envia un comando PutCommand a DynamoDB para guardar la orden en la tabla especificada por la variable de entorno ORDERS_TABLE. 
      // Si la operación es exitosa, devuelve un status 201 con el objeto de la orden creada. 
      // Si ocurre un error, se captura y se devuelve un status 500 con un mensaje de error genérico.

      await dynamo.send(new PutCommand({
        TableName: process.env.ORDERS_TABLE,
        Item: order
      }))


      //Cuando llamás eventbridge.send(new PutEventsCommand({...})), estás haciendo una llamada HTTP a la API de AWS EventBridge diciéndole: "publicá este evento en mi bus"
      // funcion asincronamente

      await eventbridge.send( new PutEventsCommand({
        Entries:[{
          Source: 'restaurant.orders', //quien publica el evento 
          DetailType: 'order.created', //que tipo de evento es 
          Detail: JSON.stringify({
           orderId : order.orderId, //orderId indica el ID de la orden creada
           tableId: order.tableId,  // tableId indica el ID de la mesa para la cual se creó la orden
           items:order.items,
           createdAt: order.createdAt
          }) , //el payload- DEBE ser un string , no un objeto 
          EventBusName:process.env.EVENT_BUS_NAME //en que bus publicarlo
        }]
      }));


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