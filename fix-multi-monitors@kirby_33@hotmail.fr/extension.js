
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;

let extensionPath;

function _Run_Bash_Script() {
    let cmd = extensionPath + "/update-monitor-position";

    try {
        Main.Util.trySpawnCommandLine('/bin/chmod +x ' + cmd);
    } catch(err) {
        Main.notify('Error: Can not chmod  ' + cmd);
    }
    try {
        Main.Util.trySpawnCommandLine(cmd);
    } catch(err) {
        Main.notify('Error: ' + cmd + 'has failed');
    }
}

function init(extensionMeta) {  
	extensionPath = extensionMeta.path;
}

function enable() {
    _Run_Bash_Script();
}

function disable() {
}

