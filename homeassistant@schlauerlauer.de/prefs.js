'use strict';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Soup = imports.gi.Soup;
let session = new Soup.Session();
let enabledEntities = {};
let allEntities = {};

function init() {}

function buildPrefsWidget() {

    // Copy the same GSettings code from `extension.js`
    let gschema = Gio.SettingsSchemaSource.new_from_directory(
        Me.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    this.settings = new Gio.Settings({
        settings_schema: gschema.lookup('org.gnome.shell.extensions.homeassistant', true)
    });

    // Create a parent widget that we'll return from this function
    let prefsWidget = new Gtk.Grid({
        margin: 18,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    // Add a simple title and add it to the prefsWidget
    let title = new Gtk.Label({
        label: '<b>' + Me.metadata.name + ' Extension Preferences</b>',
        halign: Gtk.Align.START,
        use_markup: true,
        visible: true
    });
    prefsWidget.attach(title, 0, 0, 2, 1);

    // Create a label & switch for `show-indicator`
    let toggleLabel = new Gtk.Label({
        label: 'Show Extension Indicator',
        halign: Gtk.Align.START,
        visible: true
    });
    prefsWidget.attach(toggleLabel, 0, 1, 1, 1);

    let toggle = new Gtk.Switch({
        active: this.settings.get_boolean('show-indicator'),
        halign: Gtk.Align.END,
        vexpand: false,
        visible: true,
    });
    prefsWidget.attach(toggle, 1, 1, 1, 1);

    // Bind the switch to the `show-indicator` key
    this.settings.bind(
        'show-indicator',
        toggle,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Home Assistant URL Input
    let urlLabel = new Gtk.Label({
        label: 'Home Assistant URL',
        halign: Gtk.Align.START,
        visible: true
    })
    prefsWidget.attach(urlLabel, 0, 2, 1, 1);

    let urlBox = new Gtk.Entry({
        halign: Gtk.Align.START,
        visible: true,
        text: this.settings.get_string('ha-url'),
    })
    urlBox.set_placeholder_text("http://192.168.1.2:8123");
    prefsWidget.attach(urlBox, 1, 2, 1, 1);

    // Home Assistant Token Input
    let tokenLabel = new Gtk.Label({
        label: 'Home Assistant Access Token',
        halign: Gtk.Align.START,
        visible: true,
    })
    prefsWidget.attach(tokenLabel, 0, 3, 1, 1);

    let tokenBox = new Gtk.Entry({
        halign: Gtk.Align.START,
        visible: true,
        text: this.settings.get_string('ha-key'),
    })
    tokenBox.set_placeholder_text("long-lived-access-token");
    prefsWidget.attach(tokenBox, 1, 3, 1, 1);

    // Home Assistant Update Input
    let updateLabel = new Gtk.Label({
        label: 'Entity update interval',
        halign: Gtk.Align.START,
        visible: true,
    })
    prefsWidget.attach(updateLabel, 0, 4, 1, 1);

    let updateBox = new Gtk.Entry({
        halign: Gtk.Align.START,
        visible: true,
        text: String(this.settings.get_int('ha-interval')),
    })
    updateBox.set_placeholder_text("interval in seconds"); // TODO update widget and add Update Entities Button
    prefsWidget.attach(updateBox, 1, 4, 1, 1);

    // Create a label to describe our button and add it to the prefsWidget
    let saveLabel = new Gtk.Label({
        label: 'Save Settings',
        halign: Gtk.Align.START,
        visible: true
    });
    prefsWidget.attach(saveLabel, 0, 5, 1, 1);

    // Create a 'Save' button and add it to the prefsWidget
    let saveButton = new Gtk.Button({
        label: 'Save & Test Connection',
        visible: true
    });
    prefsWidget.attach(saveButton, 1, 5, 1, 1);

    // Create a label to describe our button and add it to the prefsWidget
    let connectionLabel = new Gtk.Label({
        label: 'Status',
        halign: Gtk.Align.START,
        visible: true,
    });
    prefsWidget.attach(connectionLabel, 0, 6, 1, 1);

    let connectionStatus = new Gtk.Label({
        label: 'Unknown',
        halign: Gtk.Align.START,
        visible: true,
    });
    prefsWidget.attach(connectionStatus, 1, 6, 1, 1);

    // Add Info Label
    let infoLabel = new Gtk.Label({
        label: 'Supported Services',
        halign: Gtk.Align.START,
        visible: true,
    });
    prefsWidget.attach(infoLabel, 0, 7, 1, 1);
    let typeLabel = new Gtk.Label({
        label: 'light/toggle\nswitch/toggle\nscene/turn_on\nautomation/trigger',
        halign: Gtk.Align.START,
        visible: true,
    });
    prefsWidget.attach(typeLabel, 1, 7, 1, 1);


    // Connect the ::clicked signal to save the settings
    saveButton.connect('clicked', () => {
        let url = urlBox.get_text();
        let token = tokenBox.get_text();
        this.settings.set_string('ha-url', url);
        this.settings.set_string('ha-key', token);
        this.settings.set_int('ha-interval', parseInt(updateBox.get_text()));
        testConnection(session, connectionStatus, url, token);
    });

    let url = urlBox.get_text();
    let token = tokenBox.get_text();

    // ALL ENTITIES
    let scrollBox = new Gtk.ScrolledWindow({
        visible: true,
    });
    let entityBox = new Gtk.ListBox({
        halign: Gtk.Align.START,
        visible: true,
    });
    scrollBox.add(entityBox);
    queryEntities(session, url, token, entityBox);

    unpackEnabled();

    // ENABLED ENTITIES
    let enabledScroll = new Gtk.ScrolledWindow({
        visible: true,
    });
    let listBox = new Gtk.ListBox({
        halign: Gtk.Align.START,
        visible: true,
    });
    enabledScroll.add(listBox);
    updateEnabledEntities(listBox, enabledEntities);

    // Create a 'Toggle Entities' button
    let toggleEntities = new Gtk.Button({
        label: 'Add selected entities',
        visible: true
    });
    prefsWidget.attach(toggleEntities, 3, 1, 4, 1);

    // STACK
    let stack = new Gtk.Stack({
        visible: true,
        vexpand: true,
    });
    stack.add_titled(scrollBox, "available", "Available Entities");
    stack.add_titled(enabledScroll, "enabled", "Enabled Entities");
    prefsWidget.attach(stack, 3, 2, 4, 20);


    let stackSwitcher = new Gtk.StackSwitcher({
        visible: true,
    });
    prefsWidget.attach(stackSwitcher, 3, 0, 4, 1);
    stackSwitcher.set_stack(stack);

    stack.connect("notify::visible-child", function () {
        if (stack.get_visible_child_name() == "available") toggleEntities.set_label("Add selected entities");
        else toggleEntities.set_label("Remove selected entities");
    });

    //CONNECT LIST BOX EVENTS
    toggleEntities.connect('clicked', function (asd) {
        let row = stack.get_visible_child().get_child().get_child().get_selected_row();
        let text = row.get_child().get_text();
        if (stack.get_visible_child_name() == "available") {
            enabledEntities[text] = allEntities[text];  
            let enabled = new Gtk.Label({
                label: text,
                halign: Gtk.Align.START,
                use_markup: true,
                visible: true
            });
            listBox.insert(enabled, -1);
        } else {
            delete enabledEntities[text];
            listBox.remove(row);
        }
        saveEnabled();
    });

    return prefsWidget;
}

function updateEnabledEntities(listBox, entities) {
    for (let entity in entities) {
        let enabled = new Gtk.Label({
            label: entity,
            halign: Gtk.Align.START,
            use_markup: true,
            visible: true
        });
        listBox.insert(enabled, -1);
    }
}

function testConnection(session, label, url, token) {
    label.set_text("Querying API ...");
    url += "/api/config";
    let message = Soup.form_request_new_from_hash('GET', url, {});
    message.request_headers.append("Authorization", "Bearer " + token);

    session.queue_message(message, function (session, message) {
        let json = {};
        json["version"] = "unknown";
        let code = "";
        code = Soup.Status.get_phrase(message.status_code);
        if (message.status_code == Soup.Status.OK) {
            json = JSON.parse(message.response_body.data);
            code += ", Version: " + json["version"];
        }
        label.set_text(String(message.status_code) + " " + code);
    });
}

function queryEntities(session, url, token, entityBox) {
    url += "/api/states";
    let message = Soup.form_request_new_from_hash('GET', url, {});
    message.request_headers.append("Authorization", "Bearer " + token);
    session.queue_message(message, function (session, message) {
        if (message.status_code == Soup.Status.OK) {
            allEntities = {};
            let json = JSON.parse(message.response_body.data);
            for (let i = 0; i < json.length; i++) {
                let entity = new Gtk.Label({
                    label: json[i]["entity_id"],
                    halign: Gtk.Align.START,
                    use_markup: true,
                    visible: true
                });
                entityBox.insert(entity, i);
                allEntities[json[i]["entity_id"]] = json[i]["attributes"]["friendly_name"];
            }
        }
    });
}

function unpackEnabled() {
    enabledEntities = this.settings.get_value('entities').deep_unpack();
}

function saveEnabled() {
    this.settings.set_value(
        'entities',
        new GLib.Variant('a{ss}', enabledEntities),
    );
}