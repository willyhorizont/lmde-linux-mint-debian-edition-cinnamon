const Applet = imports.ui.applet;

function FreeTextApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

FreeTextApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, instance_id);
        this.set_applet_tooltip("Free Text");

        this.set_applet_label("|         willyhorizont.github.io         |");
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new FreeTextApplet(orientation, panel_height, instance_id);
}
