const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

function SimpleResourceMonitorApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

SimpleResourceMonitorApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, instance_id);
        this.set_applet_tooltip("Simple Resource Monitor");
        this.net_interface = "wlp3s0";
        this.last_time = GLib.get_monotonic_time();
        this.last_bytes = { read: 0, write: 0, down: 0, up: 0 };
        this.last_cpu = { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0 };

        this._update_loop();
    },

    _update_loop: function() {
        this._fetch_system_data();
        this._scheduler = Mainloop.timeout_add(2000, () => {
            this._update_loop();
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
                    const [success, stdout, stderr] = obj.communicate_utf8_finish(res);
                    if (success && stdout) {
                        this._parse_and_display(stdout.trim());
                    }
                } catch (e) {
                    global.logError("Failed read subprocess output: " + e.message);
                }
            });
        } catch (e) {
            global.logError("Failed to launch subprocess: " + e.message);
        }
    },
    _format_rate: function(bytes_per_second) {
        if (bytes_per_second <= 0 || isNaN(bytes_per_second)) return "0B/s";
        const units = ["B/s", "KB/s", "MB/s"];
        let i = 0;
        while (bytes_per_second >= 1024 && i < units.length - 1) {
            bytes_per_second /= 1024;
            i += 1;
        }
        return i === 0 ? `${Math.round(bytes_per_second)}${units[i]}` : `${bytes_per_second.toFixed(3)}${units[i]}`;
    },

    _parse_and_display: function(output) {
        const parts = output.split('|');
        if (parts.length < 7) return;

        const temp = parts[0];

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

        const total_old = old_idle + old_non_idle;
        const total_new = new_idle + new_non_idle;

        const total_delta = total_new - total_old;
        const idle_delta = new_idle - old_idle;

        let cpu_percent = 0.0;
        if (total_delta > 0) {
            cpu_percent = ((total_delta - idle_delta) / total_delta) * 100;
        }

        this.last_cpu = { user, nice, system, idle, iowait, irq, softirq };

        const gpu = parts[2];
        const ram = parts[3];

        const disk_raw = parts[4].split('/');
        const disk_total_bytes = parseInt(disk_raw[0]) || 0;
        const disk_available_bytes = parseInt(disk_raw[1]) || 0;
        const disk_free_gb = (disk_available_bytes / 1e9).toFixed(2);
        const disk_total_gb = (disk_total_bytes / 1e9).toFixed(2);
        const disk_string = `${disk_free_gb}/${disk_total_gb}`;

        const disk_io = parts[5].split(' ');
        const current_disk_read = (parseInt(disk_io[0]) || 0) * 512;
        const current_disk_write = (parseInt(disk_io[1]) || 0) * 512;

        const net_io = parts[6].split(' ');
        const current_net_down = parseInt(net_io[0]) || 0;
        const current_net_up = parseInt(net_io[1]) || 0;

        const now = GLib.get_monotonic_time();
        let time_delta = (now - this.last_time) / 1000000.0;
        if (time_delta <= 0) time_delta = 2.0;

        let r_rate = this.last_bytes.read > 0 ? ((current_disk_read - this.last_bytes.read) / time_delta) : 0;
        let w_rate = this.last_bytes.write > 0 ? ((current_disk_write - this.last_bytes.write) / time_delta) : 0;
        let d_rate = this.last_bytes.down > 0 ? ((current_net_down - this.last_bytes.down) / time_delta) : 0;
        let u_rate = this.last_bytes.up > 0 ? ((current_net_up - this.last_bytes.up) / time_delta) : 0;

        r_rate = Math.max(0, r_rate);
        w_rate = Math.max(0, w_rate);
        d_rate = Math.max(0, d_rate);
        u_rate = Math.max(0, u_rate);

        this.last_time = now;
        this.last_bytes = { read: current_disk_read, write: current_disk_write, down: current_net_down, up: current_net_up };

        const f_r = this._format_rate(r_rate);
        const f_w = this._format_rate(w_rate);
        const f_d = this._format_rate(d_rate);
        const f_u = this._format_rate(u_rate);

        const labelText = `T ${temp}°C | C ${cpu_percent.toFixed(1)}% | G ${gpu}% | M ${ram}GB | D ${disk_string}GB | R ${f_r} | W ${f_w} | ↓ ${f_d} | ↑ ${f_u}`;
        this.set_applet_label(labelText);
    },

    on_applet_removed_from_panel: function() {
        if (this._scheduler) {
            Mainloop.source_remove(this._scheduler);
        }
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new SimpleResourceMonitorApplet(orientation, panel_height, instance_id);
}
