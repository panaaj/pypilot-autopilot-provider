import { AutopilotProviderApp } from './'

import { io, Socket } from 'socket.io-client'
import { AutopilotInfo } from './sk-api'

export interface PYPILOT_CONFIG {
  host: string
  port: number
}

// autopilot data
export const apData: AutopilotInfo = {
  options: {
    states: [
      { name: 'enabled', engaged: true },
      { name: 'disabled', engaged: false }
    ],
    modes: []
  },
  state: null,
  mode: null,
  target: null,
  engaged: false
}

let server: AutopilotProviderApp
let pluginId: string
let socket: Socket

export const PILOTIDS = ['pypilot-d1']

// initialise connection to autopilot and register pypilot_web socket listeners
export const initPyPilot = (
  app: AutopilotProviderApp,
  id: string,
  config: PYPILOT_CONFIG
) => {
  server = app
  pluginId = id
  server.debug(`** Connecting to PyPilot **`)
  socket = io(`http://${config.host}:${config.port}`)

  if (!socket) {
    const msg = `PyPilot NOT connected @ ${config.host}:${config.port}... ensure 'pypilot_web' is running.`
    console.log(msg)
    server.setPluginStatus(msg)
    return
  }
  initPyPilotListeners()
}

export const closePyPilot = () => {
  if (socket) {
    socket.close()
  }
}

// PyPilot socket event listeners
const initPyPilotListeners = () => {
  socket.on('connect', () => {
    server.debug('socket connected...')
    let msg = `Started: Connected to PyPilot.`
    server.setPluginStatus(msg)

    setTimeout(() => {
      const period = 1
      //socket.emit('pypilot', `watch={"ap.heading": ${JSON.stringify(period)}}`)
      socket.emit(
        'pypilot',
        `watch={"ap.heading_command": ${JSON.stringify(period)}}`
      )
      socket.emit('pypilot', `watch={"ap.enabled": ${JSON.stringify(period)}}`)
      socket.emit('pypilot', `watch={"ap.mode": ${JSON.stringify(period)}}`)
    }, 1000)
  })

  socket.on('connect_error', () => {
    server.debug('socket connect_error!')
    server.setPluginStatus(`Unable to connect to PyPilot!`)
    apData.state = 'off-line'
    apData.engaged = false
    server.autopilotUpdate(PILOTIDS[0], 'state', apData.state)
    server.autopilotUpdate(PILOTIDS[0], 'engaged', apData.engaged)
  })

  // pypilot updates listener (values)
  socket.on('pypilot', (msg) => {
    handlePyPilotUpdateMsg(JSON.parse(msg))
  })

  // pypilot_values listener (choices)
  socket.on('pypilot_values', (msg) => {
    handlePyPilotValuesMsg(JSON.parse(msg))
  })
}

// Send values to pypilot
const sendToPyPilot = (path: string, value: any): Promise<void> => {
  server.debug(path)
  server.debug(value)
  let mode: string = ''

  if (path === 'mode') {
    if (typeof value === 'string') {
      mode = 'ap.mode'
    }
  } else if (path === 'state') {
    if (typeof value === 'boolean') {
      mode = 'ap.enabled'
    }
  } else if (path === 'target') {
    if (typeof value === 'number') {
      mode = 'ap.heading_command'
    }
  } else if (path === 'tack') {
    if (
      typeof value === 'string' &&
      (value === 'port' || value === 'starboard')
    ) {
      mode = 'ap.tack.direction'
    }
  } else {
    server.debug('Error: Invalid value!')
  }

  if (mode) {
    try {
      socket.emit('pypilot', mode + '=' + JSON.stringify(value))
      return Promise.resolve()
    } catch (error) {
      server.debug((error as Error).message)
      throw new Error('Error: Sending data to autopilot!')
    }
  } else {
    throw new Error('Error: Invalid value!')
  }
}

interface PYPILOT_UPDATE_MSG {
  'ap.heading': number
  'ap.heading_command': boolean
  'ap.mode': string
  'ap.enabled': boolean
}

// process received pypilot update messages (values)
const handlePyPilotUpdateMsg = (data: PYPILOT_UPDATE_MSG) => {
  // compare and send delta
  //server.debug(`apUpdateMsg: ${JSON.stringify(data)}`)

  if (typeof data['ap.heading_command'] !== 'undefined') {
    const heading =
      data['ap.heading_command'] === false ? null : data['ap.heading_command']
    if (typeof heading === 'number') {
      const rad = (Math.PI / 180) * heading
      if (rad !== apData.target) {
        apData.target = rad
        server.autopilotUpdate(PILOTIDS[0], 'target', apData.target)
      }
    }
  }

  if (typeof data['ap.mode'] !== 'undefined') {
    if (data['ap.mode'] !== apData.mode) {
      apData.mode = data['ap.mode']
      server.autopilotUpdate(PILOTIDS[0], 'mode', apData.mode)
    }
  }

  if (typeof data['ap.enabled'] !== 'undefined') {
    if (data['ap.enabled'] !== apData.engaged) {
      apData.state = data['ap.enabled'] ? 'enabled' : 'disabled'
      apData.engaged = data['ap.enabled']
      server.autopilotUpdate(PILOTIDS[0], 'state', apData.state)
      server.autopilotUpdate(PILOTIDS[0], 'engaged', apData.engaged)
    }
  }
}

interface PYPILOT_VALUES_MSG {
  'ap.mode': {
    choices: string[]
  }
}

// process received pypilot_values message (choices)
const handlePyPilotValuesMsg = (data: PYPILOT_VALUES_MSG) => {
  // available modes
  if (typeof data['ap.mode'] !== undefined && data['ap.mode'].choices) {
    apData.options.modes = Array.isArray(data['ap.mode'].choices)
      ? data['ap.mode'].choices
      : []
  }
}

// set autopilot state
export const apSetState = (state: string): boolean => {
  server.debug(`${pluginId} => apSetState(${state})`)
  let st: any
  apData.options.states.forEach((i) => {
    if (i.name === state) {
      st = i
    }
  })
  if (!st) {
    throw new Error('Invalid state supplied!')
  }
  sendToPyPilot('state', st.engaged)
  return st.engaged
}

// set autopilot mode
export const apSetMode = (mode: string) => {
  server.debug(`${pluginId} => apsetMode(${mode})`)
  if (apData.options.modes.includes(mode)) {
    sendToPyPilot('mode', mode)
    return
  } else {
    throw new Error('Invalid mode supplied!')
  }
}

// set autopilot target
export const apSetTarget = (value: number) => {
  let deg = value * (180 / Math.PI)
  if (deg > 359) {
    deg = 359
  } else if (deg < -179) {
    deg = -179
  }
  server.debug(`${pluginId} => Setting Target value to ${deg}`)
  sendToPyPilot('target', deg)
  return
}

// perform tack
export const apTack = (port: boolean) => {
  server.debug(`${pluginId} => apTack(${port})`)
  sendToPyPilot('tack', port ? 'port' : 'starboard')
  return
}
