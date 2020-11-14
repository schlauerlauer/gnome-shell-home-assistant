'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

// For compatibility checks, as described above
const Config = imports.misc.config;
const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);
const Soup = imports.gi.Soup;

let session = new Soup.Session();
var indicator = null;
let ha_url = "";
let ha_token = "";

var ExampleIndicator = class ExampleIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, `${Me.metadata.name} Indicator`, false);

        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'go-home-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);

        let gschema = Gio.SettingsSchemaSource.new_from_directory(
            Me.dir.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );

        this.settings = new Gio.Settings({
            settings_schema: gschema.lookup('org.gnome.shell.extensions.homeassistant', true)
        });

        ha_url = this.settings.get_string('ha-url');
        ha_token = this.settings.get_string('ha-key');

        // Add a menu item for each entity in setting
        let entities = this.settings.get_strv('entities');
        for (let i = 0; i < entities.length; i++) {
            this.menu.addAction(
                entities[i],
                this.toggleEntityState.bind(null, entities[i]),
                null
            );
        }

        // TODO periodically connect to changes in settings
    }

    toggleEntityState(entity) {
        let str = entity.split(".");
        let service = "services/";
        switch (str[0]) {
            case "light":
                service += "light/toggle";
                break;
            case "switch":
                service += "switch/toggle";
                break;
            default:
                log(str[0] + " domain not supported yet.");
                break;
        }
        queryHA(entity, service);
    }
}

if (SHELL_MINOR > 30) {
    ExampleIndicator = GObject.registerClass(
        {GTypeName: 'ExampleIndicator'},
        ExampleIndicator
    );
}

function queryHA(entity, service) {
    let _ha_url = ha_url + "/api/" + service;
    let message = Soup.Message.new('POST', _ha_url);
    message.set_request("application/json", 2, '{"entity_id":"'+entity+'"}');
    message.request_headers.append("Authorization", "Bearer " + ha_token);
    session.queue_message(message, function (session, message) {
        if (message.status_code != 200) {
            log("HA API request unsuccessful, status code: "+ String(message.status_code));
        }
    });
}

function init() {
    log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}

function enable() {
    log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
    indicator = new ExampleIndicator();
    Main.panel.addToStatusArea(`${Me.metadata.name} Indicator`, indicator);
}

function disable() {
    log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`);
    if (indicator !== null) {
        indicator.destroy();
        indicator = null;
    }
}