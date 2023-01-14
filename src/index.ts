import {
  Plugin,
  PluginServerApp,
  AutopilotProviderRegistry
} from '@signalk/server-api'

import {
  initPyPilot,
  closePyPilot,
  apData,
  apEnable,
  apSetMode,
  apSetTarget,
  apTack
} from './pypilot'

interface DeltaUpdate {
  updates: [
    {
      values: Array<{
        path: string
        value: any
      }>
    }
  ]
}

export interface AutopilotProviderApp
  extends PluginServerApp,
    AutopilotProviderRegistry {
  statusMessage?: () => string
  error: (msg: string) => void
  debug: (msg: string) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  setProviderStatus: (providerId: string, status?: string) => void
  setProviderError: (providerId: string, status?: string) => void
  getSelfPath: (path: string) => void
  savePluginOptions: (options: any, callback: () => void) => void
  handleMessage: (id: string | null, msg: DeltaUpdate) => void
  streambundle: {
    getSelfBus: (path: string | void) => any
  }
  config: { configPath: string }
}

const CONFIG_SCHEMA = {
  properties: {
    pypilot: {
      type: 'object',
      title: 'PyPilot host details.',
      description: 'Configure the PyPilot connection settings.',
      properties: {
        host: {
          type: 'string',
          title: 'Host name / address',
          default: 'localhost'
        },
        port: {
          type: 'number',
          title: 'Port number',
          default: 8000
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {}

module.exports = (server: AutopilotProviderApp): Plugin => {
  let subscriptions: any[] = [] // stream subscriptions

  const plugin: Plugin = {
    id: 'pypilot-autopilot-provider',
    name: 'Autopilot Provider (PyPilot)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: any, restart: any) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }

  let settings: any = {
    pypilot: {
      host: 'localhost',
      port: 8000
    }
  }

  const doStartup = (options: any) => {
    try {
      server.debug(`${plugin.name} starting.......`)
      if (options && options.pypilot) {
        settings = options
      } else {
        // save defaults if no options loaded
        server.savePluginOptions(settings, () => {
          server.debug(`Default configuration applied...`)
        })
      }
      server.debug(`Applied configuration: ${JSON.stringify(settings)}`)

      // register as autopilot provider
      const result = registerProvider()

      const msg = !registerProvider() ? `PyPilot` : `Provider not registered!`

      server.setPluginStatus(msg)

      // initialise autopilot connection
      initialise()
    } catch (error) {
      const msg = `Started with errors!`
      server.setPluginError(msg)
      server.error('error: ' + error)
    }
  }

  const doShutdown = () => {
    server.debug(`${plugin.name} stopping.......`)
    closePyPilot()
    server.debug('** Un-registering Update Handler(s) **')
    subscriptions.forEach((b) => b())
    subscriptions = []
    const msg = 'Stopped.'
    server.setPluginStatus(msg)
  }

  const deltaPath = 'steering.autopilot'

  const registerProvider = (): boolean => {
    try {
      server.registerAutopilotProvider({
        pilotType: 'PyPilot',
        methods: {
          getConfig: () => {
            return Promise.resolve(apData)
          },
          engage: (enable: boolean): Promise<void> => {
            apEnable(enable)
            return Promise.resolve()
          },
          setState: (state: string): Promise<void> => {
            return apEnable(state === 'enabled' ? true : false)
          },
          getState: (): Promise<string> => {
            return Promise.resolve(apData.state)
          },
          setMode: (mode: string): Promise<void> => {
            return apSetMode(mode)
          },
          getMode: (): Promise<string> => {
            return Promise.resolve(apData.mode)
          },
          setTarget: (value: number): Promise<void> => {
            return apSetTarget(value)
          },
          adjustTarget: (value: number): Promise<void> => {
            return apSetTarget(apData.target + value)
          },
          tack: (port: boolean): Promise<void> => {
            return apTack(port)
          }
        }
      })
      return true
    } catch (error) {
      return false
    }
  }

  // initialise autopilot connection / emit status
  const initialise = () => {
    server.debug('Initialising autopilot comms....')

    // register as autopilot provider
    initPyPilot(server, plugin.id, settings.pypilot)
  }

  return plugin
}
