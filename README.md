# Signal K PyPilot Autopilot Provider Plugin:

__Signal K server plugin for integrating PyPilot with Signal K server Autopilot API__.

_Note: This plugin should ONLY be installed on a Signal K server that implements the `Autopilot API`!_

---
## Description

This plugin integrates with PyPilot to act as a provider for the Signal K Autopilot API which provides services under the path `/signalk/v2/api/vessels/self/steering/autopilots`.


**Note: The `pypilot_web` process must be running on the PyPilot host!**

The plugin requires the websocket connection provided by `pypilot_web` to communicate with PyPilot.

Type `pypilot_web` in a terminal window to start the process.

---
## Configuration

From the Signal K server `Admin` console:
-  Select **Server** -> **Plugin Config**

-  From the list of plugins select `Autopilot Provider(PyPilot)`  to display the details screen.

- Enter the host name / ip address of the PyPilot host.

- Enter the port on which `pypilot_web` is listening.

- To initiate connection **Enable** the plugin.


