const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

function SimpleClockApplet(o, p_h, id) {
    this._init(o, p_h, id);
}

SimpleClockApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(o, p_h, id) {
        Applet.TextApplet.prototype._init.call(this, o, id);
        this.set_applet_tooltip("Simple Clock");

        if (this.actor) {
            this.actor.set_style("background-color: #C2066D;");
        }

        if (this._applet_label) {
            this._applet_label.set_style("font-family: monospace, Courier New; color: #ffffff;");
        }

        this._upd();
    },

    _upd: function() {
        const now = GLib.DateTime.new_now_local();
        const month_num = now.format("%m");
        const day_num = now.format("%d");
        const year = now.get_year();
        const month = now.get_month();
        const total_days = new Date(year, month, 0).getDate();

        const date_string = now.format("%a, %d %b %Y");

        const time_24 = now.format("%H:%M:%S");
        const time_12 = now.format("%I:%M:%S %p");

        const labelText = `| ${month_num}/12 months | ${day_num}/${total_days} days | ${date_string} | ${time_24} | ${time_12} `;

        this.set_applet_label(labelText);

        this._scheduler = Mainloop.timeout_add(1000, () => {
            this._upd();
            return false;
        });
    },

    on_applet_removed_from_panel: function() {
        if (this._scheduler) {
            Mainloop.source_remove(this._scheduler);
        }
    }
};

function main(metadata, o, p_h, id) {
    return new SimpleClockApplet(o, p_h, id);
}
