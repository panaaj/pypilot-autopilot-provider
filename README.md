# Signal K PyPilot Autopilot Provider Plugin:


## About

Signal K server plugin for PyPilot that enables commands to be sent by Signal K client applications via the Autopilot API.

This plugin provides support for the `actions` enhancement to the Signal K Autopilot API and makes available the following actions:

- tack
- courseCurrentPoint

> **Note:** The actions available for use will change based on the current state of the autopilot.
> - An error response will be received when trying to invoke an action that is not available.

_e.g. **courseCurrentPoint** action is only available when:_
1. _`navigation.course.nextPoint` Signal K path contains data._
1. _PyPilot `nav` mode is available for selection._

## `engage` Operation Behaviour

Submitting an `enage` request via the Autopilot API will result in the following behaviour:
1. If the `courseCurrentPoint` action is available, it will be executed _(place Pypilot into `nav` mode, and `enable`)_ 
2. Enable PyPilot in its current `mode` setting.



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


