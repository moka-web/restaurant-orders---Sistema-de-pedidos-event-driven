 import { z } from 'zod'

  export const createOrderSchema = z.object({
    tableId: z.string().min(1),
    items: z.array(
      
        z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        price: z.number().positive()
      })

    ).min(1)


  })



// Este schema define la forma que debe tener el body del request para crear una orden. Es decir, el cliente
// ----------------------------------------------------------------------------------------------------------
//   - tableId — exista y no esté vacío (el número de mesa)
//   - items — sea un array con al menos un item, y cada item tenga id, name, quantity y price con
//   tipos correctos

//   Si el body del request no cumple esto, Zod tira un error antes de que lleguemos a guardar nada
//   en la base de datos. Nunca guardamos datos inválidos.