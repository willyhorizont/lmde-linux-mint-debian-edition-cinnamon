const Applet = imports.ui.applet;

function FreeTextApplet(o, p_h, id) {
    this._init(o, p_h, id);
}

FreeTextApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(o, p_h, id) {
        Applet.TextApplet.prototype._init.call(this, o, id);
        this.set_applet_tooltip("Free Text");

        if (this.actor) {
            this.actor.set_style("background-color: #C2066D;");
        }

        if (this._applet_label) {
            this._applet_label.set_style("font-family: monospace, Courier New; color: #ffffff; font-size: 10px;");
        }

        this.set_applet_label("|       SPACE AVAILABLE     |      willyhorizont.github.io      ");
    }
};

function main(metadata, o, p_h, id) {
    return new FreeTextApplet(o, p_h, id);
}
