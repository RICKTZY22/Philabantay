import 'dotenv/config'
import { createApp } from './app'
import { readConfig } from './config'
import { createSupabaseDependencies } from './lib/supabase'
import { processDueAppointmentTransitions } from './routes/bookings'

const config = readConfig(process.env)
const dependencies = createSupabaseDependencies(config)
const app = createApp(dependencies, { webOrigin: config.webOrigin })

let lifecycleWorkerRunning = false
async function runLifecycleWorker(): Promise<void> {
  if (lifecycleWorkerRunning) return
  lifecycleWorkerRunning = true
  try {
    await processDueAppointmentTransitions(dependencies)
  } catch (error) {
    console.error('Appointment lifecycle worker failed.', error)
  } finally {
    lifecycleWorkerRunning = false
  }
}

const lifecycleWorker = setInterval(() => void runLifecycleWorker(), 60_000)
lifecycleWorker.unref()
void runLifecycleWorker()

const server = app.listen(config.port, '0.0.0.0', (error?: Error) => {
  if (error) throw error
  console.log(`Philabantay API listening on http://127.0.0.1:${config.port}`)
})

function shutdown(signal: string) {
  console.log(`${signal} received; closing API server.`)
  clearInterval(lifecycleWorker)
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
