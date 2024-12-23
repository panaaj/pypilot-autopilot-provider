import {
  Plugin,
  ServerAPI //, AutopilotProviderRegistry
} from '@signalk/server-api'

import {
  AutopilotProviderRegistry,
  TackGybeDirection,
  AutopilotInfo
} from './sk-api'

import {
  initPyPilot,
  closePyPilot,
  apData,
  apSetState,
  apSetMode,
  apSetTarget,
  apDodge,
  apTack,
  PILOTIDS
} from './pypilot'

export interface AutopilotProviderApp
  extends ServerAPI,
    AutopilotProviderRegistry {}

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

      const msg = !result ? `PyPilot` : `Provider not registered!`

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

  const registerProvider = (): boolean => {
    try {
      server.registerAutopilotProvider(
        {
          getData: async (deviceId: string): Promise<AutopilotInfo> => {
            return apData
          },
          getState: async (deviceId: string): Promise<string> => {
            return apData.state as string
          },
          setState: async (state: string, deviceId: string): Promise<void> => {
            apSetState(state)
            return
          },
          getMode: async (deviceId: string): Promise<string> => {
            return apData.mode as string
          },
          setMode: async (mode: string, deviceId: string): Promise<void> => {
            return apSetMode(mode)
          },
          getTarget: async (deviceId: string): Promise<number> => {
            return apData.target as number
          },
          setTarget: async (value: number, deviceId: string): Promise<void> => {
            return apSetTarget(value)
          },
          adjustTarget: async (
            value: number,
            deviceId: string
          ): Promise<void> => {
            if (apData.engaged) {
              const t =
                typeof apData.target !== 'number'
                  ? 0 + value
                  : apData.target + value
              apSetTarget(t)
            } else {
              apDodge(value)
            }
            return
          },
          engage: async (deviceId: string): Promise<void> => {
            apSetState('enabled')
            return
          },
          disengage: async (deviceId: string): Promise<void> => {
            apSetState('disabled')
            return
          },
          tack: async (
            direction: TackGybeDirection,
            deviceId: string
          ): Promise<void> => {
            return apTack(direction === 'port' ? true : false)
          },
          gybe: async (
            direction: TackGybeDirection,
            deviceId: string
          ): Promise<void> => {
            throw new Error('Not implemented!')
          },
          dodge: async (
            value: number | null,
            deviceId: string
          ): Promise<void> => {
            if (value) {
              apDodge(value)
            } else {
              throw new Error('Not implemented!')
            }
          }
        },
        PILOTIDS
      )
      return true
    } catch (error) {
      return false
    }
  }

  // initialise autopilot connection / emit status
  const initialise = () => {
    server.debug('Initialising autopilot comms....')
    initPyPilot(server, plugin.id, settings.pypilot)
  }

  return plugin
}
