const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

function SimpleClockApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

SimpleClockApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, instance_id);
        this.set_applet_tooltip("Simple Clock");

        this._update_clock();
    },

    _update_clock: function() {
        const now = GLib.DateTime.new_now_local();
        const month_num = now.format("%m");
        const day_num = now.format("%d");
        const year = now.get_year();
        const month = now.get_month();
        const total_days = new Date(year, month, 0).getDate();

        const date_string = now.format("%a, %d %b %Y");

        const time_24 = now.format("%H:%M:%S");
        const time_12 = now.format("%I:%M:%S %p");

        const labelText = `${month_num} / 12 months | ${day_num} / ${total_days} days | ${date_string} | ${time_24} | ${time_12}`;

        this.set_applet_label(labelText);

        this._scheduler = Mainloop.timeout_add(1000, () => {
            this._update_clock();
            return false;
        });
    },

    on_applet_removed_from_panel: function() {
        if (this._scheduler) {
            Mainloop.source_remove(this._scheduler);
        }
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new SimpleClockApplet(orientation, panel_height, instance_id);
}
