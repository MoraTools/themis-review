// The elkjs worker script: in a worker scope it answers the ELK API's messages on self (elkjs README, "Web Worker").
// elk.bundled.js cannot run here: in a worker scope its embedded worker code exports no Worker class to construct.
import 'elkjs/lib/elk-worker.min.js'
