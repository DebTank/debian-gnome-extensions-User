/*
 * CPUFreq Manager - a lightweight CPU frequency scaling monitor
 * and powerful CPU management tool
 *
 * Author (C) 2016-2018 konkor <kapa76@gmail.com>
 *
 * This file is part of CPUFreq Manager.
 *
 * CPUFreq Manager is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * CPUFreq Manager is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

function initTranslations (domain) {
    domain = domain || 'gnome-shell-extensions-cpufreq';

    let localeDir = Gio.File.new_for_path (getCurrentFile()[1] + '/locale');
    if (localeDir.query_exists (null))
        Gettext.bindtextdomain (domain, localeDir.get_path());
    else
        Gettext.bindtextdomain (domain, '/usr/share/locale');
}

function getSettings (schema) {
    schema = schema || 'org.gnome.shell.extensions.cpufreq';

    const GioSSS = Gio.SettingsSchemaSource;

    let schemaDir = Gio.File.new_for_path (getCurrentFile()[1] + '/schemas');
    let schemaSource;
    if (schemaDir.query_exists(null))
        schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);
    else
        schemaSource = GioSSS.get_default();

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension '
                        + 'cpufreq@konkor. Please check your installation.');

    return new Gio.Settings({ settings_schema: schemaObj });
}

function getCurrentFile () {
    let stack = (new Error()).stack;
    let stackLine = stack.split('\n')[1];
    if (!stackLine)
        throw new Error ('Could not find current file');
    let match = new RegExp ('@(.+):\\d+').exec(stackLine);
    if (!match)
        throw new Error ('Could not find current file');
    let path = match[1];
    let file = Gio.File.new_for_path (path);
    return [file.get_path(), file.get_parent().get_path(), file.get_basename()];
}

function get_cpu_number () {
    let c = 0;
    let cpulist = null;
    let ret = GLib.spawn_command_line_sync ("cat /sys/devices/system/cpu/present");
    if (ret[0]) cpulist = ret[1].toString().split("\n", 1)[0].split("-");
    cpulist.forEach ((f)=> {
        if (parseInt (f) > 0) c = parseInt (f);
    });
    return c + 1;
}
