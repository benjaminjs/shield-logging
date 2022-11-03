import express from 'express'
import { expressYupMiddleware } from 'express-yup-middleware'
import K from 'knex'
import compression from 'compression'
import cors from 'cors'
const { knex } = K

import Yup from 'yup'

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
        // database: 'defaultdb',
        // host: 'shield-demo-do-user-12006507-0.b.db.ondigitalocean.com',
        // password: 'AVNS_THUJ7rkgGUpPVFvCc88',
        // port: 25060,
        // user: 'doadmin',
        ssl: {
            rejectUnauthorized: false,
        },
    },
})

const app = express()
app.use(cors())
app.use(compression())

app.use((req, res, next) => {
    express.json()(req, res, (err) => {
        if (err) {
            console.error(err)
            return res.sendStatus(400) // Bad request
        }

        next()
    })
})

app.use(express.json({ limit: '50mb', strict: true }))

type Log = {
    robot: string
    deviceGeneration: string
    startTime: Date
    endTime: Date
    duration: number
    lat: number
    lng: number
}

const createLogsSchemaValidator = {
    schema: {
        body: {
            yupSchema: Yup.array()
                .of(
                    Yup.object().shape({
                        startTime: Yup.date().required('No startTime provided'),
                        endTime: Yup.date().required('No endTime provided'),
                        deviceGeneration: Yup.string().required(
                            'No deviceGeneration provided'
                        ),
                        robot: Yup.string().required('No robot provided'),
                        lat: Yup.number().required('No lat provided'),
                        lng: Yup.number().required('No lng provided'),
                    })
                )
                .min(1, 'No logs provided')
                .required(),
        },
    },
}

const queryLogsSchemaValidator = {
    schema: {
        query: {
            yupSchema: Yup.object().shape({
                minDuration: Yup.number(),
                from: Yup.date(),
                to: Yup.date(),
                deviceGeneration: Yup.string(),
                limit: Yup.number().min(1).max(500),
                offset: Yup.number().min(0).default(0),
            }),
        },
    },
}

type queryLogsSchema = Yup.InferType<
    typeof queryLogsSchemaValidator.schema.query.yupSchema
>

type createLogsSchema = Yup.InferType<
    typeof createLogsSchemaValidator.schema.body.yupSchema
>

app.post(
    '/logs',
    expressYupMiddleware({ schemaValidator: createLogsSchemaValidator }),
    async (req: express.Request, res: express.Response) => {
        const logs = (<createLogsSchema>req.body).map((log: any) => ({
            ...log,
            duration:
                new Date(log.endTime).getTime() -
                new Date(log.startTime).getTime(),
        }))
        try {
            await db.transaction(async (trx) => await trx('logs').insert(logs))
            res.status(201).send()
        } catch (err) {
            console.error(err)
            res.status(500).send()
        }
    }
)

app.get(
    '/logs',
    expressYupMiddleware({ schemaValidator: queryLogsSchemaValidator }),
    async (req: express.Request, res: express.Response) => {
        const queryParams = <queryLogsSchema>req.query

        try {
            const logs: Log[] = await db('logs')
                .select('*')
                .modify((queryBuilder) => {
                    if (queryParams.minDuration)
                        queryBuilder.where(
                            'duration',
                            '>=',
                            queryParams.minDuration
                        )

                    if (queryParams.deviceGeneration)
                        queryBuilder.where(
                            'deviceGeneration',
                            '=',
                            queryParams.deviceGeneration
                        )

                    if (queryParams.from)
                        queryBuilder.where('startTime', '>=', queryParams.from)

                    if (queryParams.to)
                        queryBuilder.where('endTime', '<=', queryParams.to)

                    queryBuilder.limit(queryParams.limit ?? 100)

                    if (queryParams.offset)
                        queryBuilder.offset(queryParams.offset)

                    return queryBuilder
                })

            res.json(logs)
        } catch (err) {
            console.error(err)
            res.status(500).send()
        }
    }
)

app.listen(process.env.PORT || 3000, () => {
    console.log('Server started')
})
