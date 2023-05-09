const shell = window.__TAURI__.shell;
const path = window.__TAURI__.path;
const fs = window.__TAURI__.fs;
const http = window.__TAURI__.http

Object.values = function (obj) {
    return Object.keys(obj).map(key => obj[key])
}

let platform;
(async () => {
    platform = await window.__TAURI__.os.platform()
})();
let frontendsProcesses = {}

function formatEnv(env) {
    if (env === undefined) return null
    let obj = {};
    env.forEach(function (property) {
        const tup = property.split('=');
        obj[tup[0]] = tup[1];
    });
    return obj
}

async function run_caddy() {
    let command
    if (platform == 'win32 ') {
        command = '.\\caddy_windows_amd64.exe'
    } else if (platform == 'linux') {
        command = './caddy_linux_amd64'
    }
    const cmd = new shell.Command(command, ['run'], { cwd: await path.resolveResource('caddy') })
    cmd.on('error', error => {
        console.error(`command error: "${error}"`)
        return false
    });

    const child = await cmd.spawn();
    frontendsProcesses['caddy'] = child
    return true
}


async function run_frontend(name, command, args, env) {
    const cmd = new shell.Command(command, args, { cwd: await path.join(await path.appDataDir(), name), env: formatEnv(env) })
    cmd.on('error', error => {
        console.error(`command error: "${error}"`)
        return 'downloaded'
    });
    const child = await cmd.spawn();
    frontendsProcesses[name] = child
    return 'running'
}

function download_frontend(name) {
    return new Promise(async resolve => {
        let filename
        if (platform == 'linux') {
            filename = `${name}_linux_x86_64.tar.gz`
        } else if (platform == 'win32') {
            filename = `${name}_windows_x86_64.zip`
        }
        const response = await http.fetch(
            `https://github.com/libredirect/frontends_binaries/raw/main/binaries/${filename}`,
            { method: 'GET', responseType: http.ResponseType.Binary }
        );
        await fs.writeBinaryFile(filename, new Uint8Array(response.data), { dir: fs.BaseDirectory.AppData });
        let extract_cmd
        if (platform == 'linux') {
            extract_cmd = new shell.Command('tar', ['-xzf', filename], { cwd: await path.appDataDir() })
        } else if (platform == 'win32') {
            extract_cmd = new shell.Command('tar', ['-acf', filename], { cwd: await path.appDataDir() })
        }
        extract_cmd.on('close', async () => {
            await fs.removeFile(filename, { dir: fs.BaseDirectory.AppData })
            resolve('downloaded')
        });
        await extract_cmd.spawn();
    })
}

async function check_downloaded(name) {
    if (await fs.exists(`${name}`, { dir: fs.BaseDirectory.AppData })) {
        return 'downloaded'
    } else {
        return 'not_downloaded'
    }
}
async function remove_frontend(name) {
    await fs.removeDir(name, { dir: fs.BaseDirectory.AppData, recursive: true })
    return 'not_downloaded'
}

async function stop_frontend(name, slice) {
    const result = await frontendsProcesses[name].kill();
    if (slice) delete [name]
    if (result == null) return 'downloaded'
    else return 'running'
}

async function stop_all() {
    for (const name of Object.keys(frontendsProcesses)) {
        await stop_frontend(name, false)
    }
}

export default {
    run_caddy,
    check_downloaded,
    remove_frontend,
    stop_all,
    stop_frontend,
    run_frontend,
    download_frontend,
}