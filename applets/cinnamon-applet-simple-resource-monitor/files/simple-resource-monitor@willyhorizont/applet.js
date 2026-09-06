const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

function App(o, p_h, id) {
    this._init(o, p_h, id);
}

App.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(o, p_h, id) {
        Applet.TextApplet.prototype._init.call(this, o, id);
        this.set_applet_tooltip("SPRM");
        this.netintrf = "wlp3s0";
        this.lsttime = GLib.get_monotonic_time();
        this.lstbytes = { read: 0, write: 0, down: 0, up: 0 };
        this.lstcpu = { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0 };

        if (this.actor) {
            this.actor.set_style("background-color: #C2066D;");
        }

        if (this._applet_label) {
            this._applet_label.set_style("font-family: monospace, Courier New; color: #ffffff; font-size: 10px;");
        }

        this._upd();
    },

    _upd: function() {
        this._fetch_system_data();
        this._scheduler = Mainloop.timeout_add(2000, () => {
            this._upd();
            return false;
        });
    },

    _fetch_system_data: function() {
        const bash_command = `
            TEMP=$(sensors 2>/dev/null | awk '/Core/ {sum+=$3; count++} END {if (count > 0) printf "%.1f", sum/count; else print "0.0"}')
            CPU=$(awk '/^cpu / {print $2" "$3" "$4" "$5" "$6" "$7" "$8}' /proc/stat)
            GPU=$(cat /sys/class/drm/card0/device/gpu_busy_percent 2>/dev/null || echo "0")
            RAM=$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {printf "%.2f/%.2f", (t-a)/1024/1024, t/1024/1024}' /proc/meminfo)
            DISK=$(df -B1 / | awk 'NR==2 {printf "%s/%s", $2, $4}')
            DISK_IO=$(awk '/ss/ || /sd/ || /nvme/ {r+=$6; w+=$10} END {print r" "w}' /proc/diskstats)
            NET_IO=$(awk -F: '/` + this.netintrf + `/ {print $2}' /proc/net/dev | awk '{print $1" "$9}')
            if [ -z "$NET_IO" ]; then NET_IO="0 0"; fi

            echo "$TEMP|$CPU|$GPU|$RAM|$DISK|$DISK_IO|$NET_IO"
        `;

        try {
            const proc = Gio.Subprocess.new(
                ['sh', '-c', bash_command],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (obj, res) => {
                try {
                    const [ok, out, err] = obj.communicate_utf8_finish(res);
                    if (ok && out) {
                        this._parse_and_display(out.trim());
                    }
                } catch (e) {
                    global.logError("Err: " + e.message);
                }
            });
        } catch (e) {
            global.logError("Err: " + e.message);
        }
    },
    _pad: function(str, target_len) {
        return str.padStart(target_len, ' ');
    },

    _fmt: function(bytesps) {
        if (bytesps <= 0 || isNaN(bytesps)) return "      0B/s";
        const units = ["B/s", "KB/s", "MB/s"];
        let i = 0;
        let v = bytesps;
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024;
            i += 1;
        }

        let num_str = "";
        if (i === 0) {
            num_str = v.toFixed(3);
        } else {
            num_str = v.toFixed(2);
        }

        const parts = num_str.split('.');
        const f_p = parts[0];
        const b_p = parts[1];

        if (f_p.length > 3) return "999999GB/s";

        return `${this._pad(f_p, 3)}.${b_p}${units[i]}`;
    },

    _parse_and_display: function(o) {
        const parts = o.split('|');
        if (parts.length < 7) return;

        const temp_v = parseFloat(parts[0]) || 0;
        let temp = "";
        if (temp_v >= 100.0) {
            temp = "9999";
        } else {
            temp = temp_v.toFixed(1);
        }

        const cpu_raw = parts[1].split(' ');
        const user = parseInt(cpu_raw[0]) || 0;
        const nice = parseInt(cpu_raw[1]) || 0;
        const system = parseInt(cpu_raw[2]) || 0;
        const idle = parseInt(cpu_raw[3]) || 0;
        const iowait = parseInt(cpu_raw[4]) || 0;
        const irq = parseInt(cpu_raw[5]) || 0;
        const softirq = parseInt(cpu_raw[6]) || 0;
        const old_idle = this.lstcpu.idle + this.lstcpu.iowait;
        const new_idle = idle + iowait;
        const old_non_idle = this.lstcpu.user + this.lstcpu.nice + this.lstcpu.system + this.lstcpu.irq + this.lstcpu.softirq;
        const new_non_idle = user + nice + system + irq + softirq;
        const tot_old = old_idle + old_non_idle;
        const tot_new = new_idle + new_non_idle;
        const tot_delta = tot_new - tot_old;
        const idle_delta = new_idle - old_idle;
        let cpu_pcent = 0.0;
        if (tot_delta > 0) {
            cpu_pcent = ((tot_delta - idle_delta) / tot_delta) * 100;
        }
        this.lstcpu = { user, nice, system, idle, iowait, irq, softirq };
        const cpu_str = cpu_pcent.toFixed(1);
        const cpu = this._pad(cpu_str, 4);

        const gpu_v = parseFloat(parts[2]) || 0;
        const gpu = this._pad(gpu_v.toFixed(1), 4);

        const ram_raw = parts[3].split('/');
        const ram_used_gbytes = parseFloat(ram_raw[0]) || 0;
        const ram_tot_gbytes = parseFloat(ram_raw[1]) || 0;
        const ram_used_str = this._pad(ram_used_gbytes.toFixed(2), 5);
        const ram_tot_str = ram_tot_gbytes.toFixed(2);

        const d_raw = parts[4].split('/');
        const d_tot_bytes = parseInt(d_raw[0]) || 0;
        const d_avail_bytes = parseInt(d_raw[1]) || 0;
        const d_free_gbytes = (d_avail_bytes / 1e9).toFixed(2);
        const d_tot_gbytes = (d_tot_bytes / 1e9).toFixed(2);

        const disk_io = parts[5].split(' ');
        const cur_d_r = (parseInt(disk_io[0]) || 0) * 512;
        const cur_d_w = (parseInt(disk_io[1]) || 0) * 512;
        const net_io = parts[6].split(' ');
        const cur_net_down = parseInt(net_io[0]) || 0;
        const cur_net_up = parseInt(net_io[1]) || 0;

        const now = GLib.get_monotonic_time();
        let time_d = (now - this.lsttime) / 1000000.0;
        if (time_d <= 0) time_d = 2.0;

        let r_rt = this.lstbytes.read > 0 ? ((cur_d_r - this.lstbytes.read) / time_d) : 0;
        let w_rt = this.lstbytes.write > 0 ? ((cur_d_w - this.lstbytes.write) / time_d) : 0;
        let d_rt = this.lstbytes.down > 0 ? ((cur_net_down - this.lstbytes.down) / time_d) : 0;
        let u_rt = this.lstbytes.up > 0 ? ((cur_net_up - this.lstbytes.up) / time_d) : 0;

        r_rt = Math.max(0, r_rt);
        w_rt = Math.max(0, w_rt);
        d_rt = Math.max(0, d_rt);
        u_rt = Math.max(0, u_rt);
        this.lsttime = now;
        this.lstbytes = { read: cur_d_r, write: cur_d_w, down: cur_net_down, up: cur_net_up };

        const f_r = this._fmt(r_rt);
        const f_w = this._fmt(w_rt);
        const f_d = this._fmt(d_rt);
        const f_u = this._fmt(u_rt);

        let rr = "";
        if (temp === "9999" || f_r.includes("999999") || f_w.includes("999999") || f_d.includes("999999") || f_u.includes("999999")) {
            const out_t = temp === "9999" ? "9999°C" : `${temp}°C`;
            const out_r = f_r.includes("999999") ? "999999GB/s" : f_r;
            const out_w = f_w.includes("999999") ? "999999GB/s" : f_w;
            const out_d = f_d.includes("999999") ? "999999GB/s" : f_d;
            const out_u = f_u.includes("999999") ? "999999GB/s" : f_u;

            rr = `T ${out_t} | C ${cpu}% | G ${gpu}% | M ${ram_used_str}/${ram_tot_str}GB | D ${d_free_gbytes}/${d_tot_gbytes}GB | R ${out_r} | W ${out_w} | ▼ ${out_d} | ▲ ${out_u} `;
        } else {
            rr = `T ${temp}°C | C ${cpu}% | G ${gpu}% | M ${ram_used_str}/${ram_tot_str}GB | D ${d_free_gbytes}/${d_tot_gbytes}GB | R ${f_r} | W ${f_w} | ▼ ${f_d} | ▲ ${f_u} `;
        }

        this.set_applet_label(rr);
    },

    on_applet_removed_from_panel: function() {
        if (this._scheduler) {
            Mainloop.source_remove(this._scheduler);
        }
    }
};

function main(metadata, o, p_h, id) {
    return new App(o, p_h, id);
}
