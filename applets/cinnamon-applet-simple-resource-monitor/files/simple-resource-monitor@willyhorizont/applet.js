const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

function SimpleResourceMonitorApplet(o, p_h, id) {
    this._init(o, p_h, id);
}

SimpleResourceMonitorApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(o, p_h, id) {
        Applet.TextApplet.prototype._init.call(this, o, id);
        this.set_applet_tooltip("Simple Resource Monitor");
        this.net_interface = "wlp3s0";
        this.last_time = GLib.get_monotonic_time();
        this.last_bytes = { read: 0, write: 0, down: 0, up: 0 };
        this.last_cpu = { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0 };

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
            CPU_RAW=$(awk '/^cpu / {print $2" "$3" "$4" "$5" "$6" "$7" "$8}' /proc/stat)
            GPU=$(cat /sys/class/drm/card0/device/gpu_busy_percent 2>/dev/null || echo "0")
            RAM_DATA=$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {printf "%.2f/%.2f", (t-a)/1024/1024, t/1024/1024}' /proc/meminfo)
            DISK_DATA=$(df -B1 / | awk 'NR==2 {printf "%s/%s", $2, $4}')
            DISK_IO=$(awk '/ss/ || /sd/ || /nvme/ {r+=$6; w+=$10} END {print r" "w}' /proc/diskstats)
            NET_IO=$(awk -F: '/` + this.net_interface + `/ {print $2}' /proc/net/dev | awk '{print $1" "$9}')
            if [ -z "$NET_IO" ]; then NET_IO="0 0"; fi

            echo "$TEMP|$CPU_RAW|$GPU|$RAM_DATA|$DISK_DATA|$DISK_IO|$NET_IO"
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
                    global.logError("Failed to read subprocess output: " + e.message);
                }
            });
        } catch (e) {
            global.logError("Failed to launch subprocess: " + e.message);
        }
    },
    _pad: function(str, target_len) {
        return str.padStart(target_len, ' ');
    },

    _fmt: function(bytes_p_sec) {
        if (bytes_p_sec <= 0 || isNaN(bytes_p_sec)) return "      0B/s";
        const units = ["B/s", "KB/s", "MB/s"];
        let i = 0;
        let v = bytes_p_sec;
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
        const old_idle = this.last_cpu.idle + this.last_cpu.iowait;
        const new_idle = idle + iowait;
        const old_non_idle = this.last_cpu.user + this.last_cpu.nice + this.last_cpu.system + this.last_cpu.irq + this.last_cpu.softirq;
        const new_non_idle = user + nice + system + irq + softirq;
        const tot_old = old_idle + old_non_idle;
        const tot_new = new_idle + new_non_idle;
        const tot_delta = tot_new - tot_old;
        const idle_delta = new_idle - old_idle;
        let cpu_percent = 0.0;
        if (tot_delta > 0) {
            cpu_percent = ((tot_delta - idle_delta) / tot_delta) * 100;
        }
        this.last_cpu = { user, nice, system, idle, iowait, irq, softirq };
        const cpu_str = cpu_percent.toFixed(1);
        const cpu = this._pad(cpu_str, 4);

        const gpu_v = parseFloat(parts[2]) || 0;
        const gpu = this._pad(gpu_v.toFixed(1), 4);

        const ram_raw = parts[3].split('/');
        const ram_used_gbytes = parseFloat(ram_raw[0]) || 0;
        const ram_tot_gbytes = parseFloat(ram_raw[1]) || 0;
        const ram_used_str = this._pad(ram_used_gbytes.toFixed(2), 5);
        const ram_tot_str = ram_tot_gbytes.toFixed(2);

        const disk_raw = parts[4].split('/');
        const disk_tot_bytes = parseInt(disk_raw[0]) || 0;
        const disk_avail_bytes = parseInt(disk_raw[1]) || 0;
        const disk_free_gbytes = (disk_avail_bytes / 1e9).toFixed(2);
        const disk_tot_gbytes = (disk_tot_bytes / 1e9).toFixed(2);

        const disk_io = parts[5].split(' ');
        const cur_disk_r = (parseInt(disk_io[0]) || 0) * 512;
        const cur_disk_w = (parseInt(disk_io[1]) || 0) * 512;
        const net_io = parts[6].split(' ');
        const cur_net_down = parseInt(net_io[0]) || 0;
        const cur_net_up = parseInt(net_io[1]) || 0;

        const now = GLib.get_monotonic_time();
        let time_delta = (now - this.last_time) / 1000000.0;
        if (time_delta <= 0) time_delta = 2.0;

        let r_rate = this.last_bytes.read > 0 ? ((cur_disk_r - this.last_bytes.read) / time_delta) : 0;
        let w_rate = this.last_bytes.write > 0 ? ((cur_disk_w - this.last_bytes.write) / time_delta) : 0;
        let d_rate = this.last_bytes.down > 0 ? ((cur_net_down - this.last_bytes.down) / time_delta) : 0;
        let u_rate = this.last_bytes.up > 0 ? ((cur_net_up - this.last_bytes.up) / time_delta) : 0;

        r_rate = Math.max(0, r_rate);
        w_rate = Math.max(0, w_rate);
        d_rate = Math.max(0, d_rate);
        u_rate = Math.max(0, u_rate);
        this.last_time = now;
        this.last_bytes = { read: cur_disk_r, write: cur_disk_w, down: cur_net_down, up: cur_net_up };

        const f_r = this._fmt(r_rate);
        const f_w = this._fmt(w_rate);
        const f_d = this._fmt(d_rate);
        const f_u = this._fmt(u_rate);

        let rr = "";
        if (temp === "9999" || f_r.includes("999999") || f_w.includes("999999") || f_d.includes("999999") || f_u.includes("999999")) {
            let out_t = temp === "9999" ? "9999°C" : `${temp}°C`;
            let out_r = f_r.includes("999999") ? "999999GB/s" : f_r;
            let out_w = f_w.includes("999999") ? "999999GB/s" : f_w;
            let out_d = f_d.includes("999999") ? "999999GB/s" : f_d;
            let out_u = f_u.includes("999999") ? "999999GB/s" : f_u;

            rr = `T ${out_t} | C ${cpu}% | G ${gpu}% | M ${ram_used_str}/${ram_tot_str}GB | D ${disk_free_gbytes}/${disk_tot_gbytes}GB | R ${out_r} | W ${out_w} | ▼ ${out_d} | ▲ ${out_u} `;
        } else {
            rr = `T ${temp}°C | C ${cpu}% | G ${gpu}% | M ${ram_used_str}/${ram_tot_str}GB | D ${disk_free_gbytes}/${disk_tot_gbytes}GB | R ${f_r} | W ${f_w} | ▼ ${f_d} | ▲ ${f_u} `;
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
    return new SimpleResourceMonitorApplet(o, p_h, id);
}
