# Signal K PyPilot Autopilot Provider Plugin:


## About

Signal K server plugin for PyPilot that enables commands to be sent by Signal K client applications via the Autopilot API .


## Requirements

- Signal K server that implements the `Autopilot API`
- `pypilot_web` process running on the PyPilot host


## Configuration

The plugin communicates with PyPilot via the websocket connection provided by the `pypilot_web` process so you will need to ensure that it is running.

From the Signal K server `Admin` console:
-  Select **Server** -> **Plugin Config**

-  From the list of plugins select `Autopilot Provider(PyPilot)`  to display the details screen.

- Enter the host name / ip address of the PyPilot host.

- Enter the port on which `pypilot_web` is listening _(default: 8000)_.

- To initiate connection **Enable** the plugin.


