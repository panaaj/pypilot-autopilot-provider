import { AutopilotProviderApp } from './'

import { io, Socket } from 'socket.io-client'
import { AutopilotInfo } from '@signalk/server-api'

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
  state: 'disabled',
  mode: null,
  target: null,
  engaged: false
}

let server: AutopilotProviderApp
let pluginId: string
let socket: Socket

const degToRad = (deg: number) => deg * (Math.PI / 180)
const radToDeg = (rad: number) => rad * (180 / Math.PI)

export const PILOTIDS = ['pypilot-sk']

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
      socket.emit('pypilot', `watch={"ap.heading": ${JSON.stringify(period)}}`)
      socket.emit(
        'pypilot',
        `watch={"ap.heading_command": ${JSON.stringify(period)}}`
      )
      socket.emit('pypilot', `watch={"ap.enabled": ${JSON.stringify(period)}}`)
      socket.emit('pypilot', `watch={"ap.mode": ${JSON.stringify(period)}}`)
    }, 1000)

    apData.state = 'disabled'
    server.autopilotUpdate(PILOTIDS[0], {
      state: apData.state,
      mode: apData.mode,
      target: apData.target,
      engaged: apData.engaged as any
    })
  })

  socket.on('connect_error', () => {
    server.debug('socket connect_error!')
    server.setPluginStatus(`Unable to connect to PyPilot!`)
    apData.state = 'off-line'
    apData.engaged = false
    server.autopilotUpdate(PILOTIDS[0], {
      state: apData.state,
      engaged: apData.engaged as any
    })
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
  } else if (path === 'dodge') {
    server.debug('** DODGE **')
    let servo_command = 0
    let servo_command_timeout = 0

    // update manual servo command
    const poll_pypilot = () => {
      server.debug(
        `** DODGE poll_pypilot -> timeout: ${servo_command_timeout}, cmd: ${servo_command} **`
      )
      server.debug(`** mode: ${mode}`)
      if (servo_command_timeout > 0) {
        setTimeout(poll_pypilot, 200)
        servo_command_timeout--
        if (servo_command_timeout <= 0) servo_command = 0
        socket.emit('pypilot', mode + '=' + JSON.stringify(servo_command))
      }
    }

    if (typeof value === 'number' && value !== 0) {
      server.debug(`** DODGE value = ${value} **`)
      const sign = value > 0 ? 1 : -1
      servo_command = -sign
      servo_command_timeout = Math.abs(value) > 5 ? 6 : 2
      mode = 'servo.command'
      setTimeout(poll_pypilot, 1000)
    }
  } else {
    server.debug('Error: Invalid value!')
  }

  if (mode) {
    try {
      if (mode !== 'ap.servo_command') {
        socket.emit('pypilot', mode + '=' + JSON.stringify(value))
      }
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
  if (typeof data['ap.heading_command'] !== 'undefined') {
    const heading =
      data['ap.heading_command'] === false ? null : data['ap.heading_command']
    if (typeof heading === 'number') {
      const rad = degToRad(heading)
      if (rad !== apData.target) {
        apData.target = rad
        server.autopilotUpdate(PILOTIDS[0], {
          target: apData.target
        })
      }
    }
  }

  if (typeof data['ap.mode'] !== 'undefined') {
    if (data['ap.mode'] !== apData.mode) {
      apData.mode = data['ap.mode']
      server.autopilotUpdate(PILOTIDS[0], {
        mode: apData.mode
      })
    }
  }

  if (typeof data['ap.enabled'] !== 'undefined') {
    if (data['ap.enabled'] !== apData.engaged) {
      apData.state = data['ap.enabled'] ? 'enabled' : 'disabled'
      apData.engaged = data['ap.enabled']
      server.autopilotUpdate(PILOTIDS[0], {
        state: apData.state,
        engaged: apData.engaged as any
      })
    }
  }

  if (typeof data['ap.heading'] !== 'undefined') {
    server.autopilotUpdate(PILOTIDS[0], {
      state: apData.state,
      engaged: apData.engaged as any
    })
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
  const deg = radToDeg(value)
  server.debug(`${pluginId} => Setting Target value to ${value} (${deg})`)
  sendToPyPilot('target', deg)
  return
}

// set autopilot target
export const apDodge = (value: number) => {
  const deg = radToDeg(value)
  server.debug(`${pluginId} => Dodge value = ${value} (${deg})`)
  sendToPyPilot('dodge', deg)
  return
}

// perform tack
export const apTack = (port: boolean) => {
  server.debug(`${pluginId} => apTack(${port})`)
  sendToPyPilot('tack', port ? 'port' : 'starboard')
  return
}
