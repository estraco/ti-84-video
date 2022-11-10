import cp from 'child_process';
import fs from 'fs';
import path from 'path';

function escapeRegExp(str: string) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function parseArgs(argv: string[]): {
    short: {
        [key: string]: string;
    },
    long: {
        [key: string]: string;
    }
} {
    const short: {
        [key: string]: string;
    } = {};
    const long: {
        [key: string]: string;
    } = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');

            if (!value && argv[i + 1] && !argv[i + 1].startsWith('--')) {
                long[key] = argv[i + 1];
                i++;
            } else if (value) {
                long[key] = value;
            } else {
                long[key] = '';
            }
        } else if (arg.startsWith('-')) {
            const [key, value] = arg.slice(1).split('=');

            if (!value && argv[i + 1] && !argv[i + 1].startsWith('-')) {
                short[key] = argv[i + 1];
                i++;
            } else if (value) {
                short[key] = value;
            } else {
                short[key] = '';
            }
        }
    }

    return {
        short,
        long
    };
}

function parseBooleanArg(arg: string, errmsg: string) {
    const trueValues = [
        '',
        'true',
        'yes',
        'y',
        '1'
    ];
    const falseValues = [
        'false',
        'no',
        'n',
        '0'
    ];

    if (trueValues.includes(arg)) {
        return true;
    }

    if (falseValues.includes(arg)) {
        return false;
    }

    throw new Error(errmsg);
}

function videoToFrames(videoPath: string, fps: number) {
    const videoName = path.basename(videoPath).split('.')[0];
    const framePath = path.join('frames', videoName, `normal-${fps}fps`, 'frame_%d.png');
    const frameDir = path.dirname(framePath);

    if (fs.existsSync(frameDir)) {
        fs.rmSync(frameDir, { recursive: true });
    }

    fs.mkdirSync(frameDir, { recursive: true });

    const cmd = `ffmpeg -i ${videoPath} -vf fps=${fps} ${framePath}`;

    cp.execSync(cmd, { stdio: 'inherit' });
}

function resizeFrames(videoName: string, width: number, height: number, fps: number) {
    // get the first frame to get the dimensions
    const framePath = path.join('frames', videoName, `normal-${fps}fps`, 'frame_1.png');

    const dimcmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${framePath}`;

    const dimensions = cp.execSync(dimcmd).toString().split('x');

    const frameWidth = parseInt(dimensions[0]);
    const frameHeight = parseInt(dimensions[1]);

    const widthLarger = frameWidth / 320 > frameHeight / 240;

    const resizePath = path.join('frames', videoName, `resized-${fps}fps-${width}x${height}`, 'frame_%d.png');
    const resizeDir = path.dirname(resizePath);

    if (fs.existsSync(resizeDir)) {
        fs.rmSync(resizeDir, { recursive: true });
    }

    fs.mkdirSync(resizeDir, { recursive: true });

    const cmd = `ffmpeg -i ${path.join('frames', videoName, `normal-${fps}fps`, 'frame_%d.png')} -vf "format=rgb24, scale=${widthLarger ? width : -1}:${widthLarger ? -1 : height}" ${resizePath}`;

    cp.execSync(cmd, { stdio: 'inherit' });
}

async function frameToHeader(videoName: string, frameDir: string, size: [number, number], fps: number, endOnLastFrame: boolean, makefileOptions: {
    archive: boolean;
    compress: boolean;
}, debug: boolean) {
    const files = fs.readdirSync(frameDir).filter((file) => file.endsWith('.png'));

    // const cmds: string[] = [];

    // for (const file of files) {
    const format =
        `palettes:
  - name: global_palette
    fixed-entries:
      - color: {index: 0, r: 255, g: 0, b: 128}
      - color: {index: 1, r: 255, g: 255, b: 255}
    images: automatic

converts:
  - name: sprites
    palette: global_palette
    transparent-color-index: 0
    images:
${files.map((file) => `      - ${file}`).join('\n')}

outputs:
  - type: c
    include-file: ${videoName}.h
    palettes:
      - global_palette
    converts:
      - sprites`;

    fs.writeFileSync(path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`, `${videoName}.yaml`), format);

    const cmd = `convimg -i ${path.resolve(path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`, `${videoName}.yaml`))}`;

    cp.execSync(cmd, {
        stdio: 'inherit',
        cwd: path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`)
    });

    const calcFolder = path.join('calc', `${videoName}-${fps}fps-${size[0]}x${size[1]}`);

    if (!fs.existsSync(calcFolder)) {
        fs.mkdirSync(calcFolder, { recursive: true });
    }

    const frameList = fs.readdirSync(path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`))
        .filter((file) => file.endsWith('.h') && file.startsWith('frame_'))
        .sort((a, b) => parseInt(a.split('_')[1].split('.')[0]) - parseInt(b.split('_')[1].split('.')[0]))
        .map((file) => file.split('.')[0]);

    const frameCount = frameList.length;

    console.log(`frameCount: ${frameCount}`);
    console.log(`fps: ${fps}`);
    console.log(`endOnLastFrame: ${endOnLastFrame}`);
    console.log(`makefileOptions.archive: ${makefileOptions.archive}`);
    console.log(`makefileOptions.compress: ${makefileOptions.compress}`);

    const main = `typedef unsigned char size_t;

#include <ti/getcsc.h>
#include <graphx.h>
#include <tice.h>
${debug ? '#include <stdio.h>\n' : ''}
#include "gfx/${videoName}.h"

#define FRAME_COUNT ${frameCount}
#define FRAME_SIZE frame_1_size

#define POS_X 0
#define POS_Y 0

#define WIDTH_RESIZE_FACTOR LCD_WIDTH / frame_1_width
#define HEIGHT_RESIZE_FACTOR LCD_HEIGHT / frame_1_height

#define FPS ${fps}
#define FRAME_DELAY (1000 / FPS)

#define END_ON_LAST_FRAME ${endOnLastFrame}

int main(void)
{
    gfx_Begin();

    gfx_SetPalette(global_palette, sizeof_global_palette, 0);

    gfx_sprite_t *frames[FRAME_COUNT] = {
        ${frameList.join(',\n        ')}
    };

    int i = 0;

    gfx_FillScreen(1);
    gfx_SetTransparentColor(0);
    gfx_SetDrawBuffer();

    while (true)
    {
        uint32_t start = rtc_Time();

        gfx_BlitBuffer();
        gfx_ScaledTransparentSprite_NoClip(frames[i], POS_X, POS_Y, WIDTH_RESIZE_FACTOR, HEIGHT_RESIZE_FACTOR);

        ${debug ? `printf("%d/%d", i + 1, FRAME_COUNT);

        ` : ''}if (os_GetCSC() == sk_Enter || (END_ON_LAST_FRAME && i + 1 >= FRAME_COUNT))
        {
            break;
        }

        uint32_t end = rtc_Time();

        uint32_t diff = end - start;

        if (diff < FRAME_DELAY)
        {
            delay(FRAME_DELAY - diff);
        }

        i++;

        if (i >= FRAME_COUNT)
        {
            i = 0;
        }
    }

    gfx_End();

    return 0;
}`;

    const gitignore = `obj/
bin/
src/gfx/*.c
src/gfx/*.h
src/gfx/*.8xv
.DS_Store
convimg.out`;

    const makefile = `
NAME = ${videoName.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase().substring(0, 8).split('.')[0]}
DESCRIPTION = "${videoName} animation"
COMPRESSED = ${makefileOptions.compress ? 'YES' : 'NO'}
ARCHIVED = ${makefileOptions.archive ? 'YES' : 'NO'}

CFLAGS = -Wall -Wextra -Oz
CXXFLAGS = -Wall -Wextra -Oz

# ----------------------------

include $(shell cedev-config --makefile)`.trim();

    if (fs.existsSync(path.join(calcFolder, 'src'))) {
        fs.rmSync(path.join(calcFolder, 'src'), { recursive: true });
    }

    if (fs.existsSync(path.join(calcFolder, 'obj'))) {
        fs.rmSync(path.join(calcFolder, 'obj'), { recursive: true });
    }

    if (fs.existsSync(path.join(calcFolder, 'bin'))) {
        fs.rmSync(path.join(calcFolder, 'bin'), { recursive: true });
    }

    fs.mkdirSync(path.join(calcFolder, 'src'), { recursive: true });
    fs.mkdirSync(path.join(calcFolder, 'src', 'gfx'), { recursive: true });

    fs.writeFileSync(path.join(calcFolder, 'src', 'main.c'), main);
    fs.writeFileSync(path.join(calcFolder, '.gitignore'), gitignore);
    fs.writeFileSync(path.join(calcFolder, 'makefile'), makefile);

    const filesToCopy = fs.readdirSync(path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`)).filter((file) => file.endsWith('.h') || file.endsWith('.c'));

    for (const file of filesToCopy) {
        fs.copyFileSync(path.join('frames', videoName, `resized-${fps}fps-${size[0]}x${size[1]}`, file), path.join(calcFolder, 'src', 'gfx', file));
    }
}

const args = parseArgs(process.argv.slice(2));

if (args.long['help'] !== undefined || args.short['h'] !== undefined) {
    console.log(`Usage: node build [options]
    
Options:
    --input <input> (-i)   - The name of the video file to build [required]
    --width <width> (-w)         - Width of the video [optional, default: 64]
    --height <height> (-h)       - Height of the video [optional, default: (240/320) * width]
    --fps <fps> (-f)             - Frames per second [optional, default: 10]
    --end-on-last-frame (-e)     - End the video on the last frame [optional, default: file extension is not .gif]
    --debug (-d)                 - Enable debug mode [optional, default: false]
    --archive (-a)               - Archive the video [optional, default: false]
    --compress (-c)              - Compress the video [optional, default: false]
    --help (-h)                  - Show this help message`);
    process.exit(0);
}

const requiredArgs = [
    ['input', 'i']
];

for (const arg of requiredArgs) {
    if (args.long[arg[0]] === undefined && args.short[arg[1]] === undefined) {
        console.error(`Missing required argument: --${arg[0]} (-${arg[1]})`);
        process.exit(1);
    }
}

const widthArg = args.long['width'] || args.short['w'];

if (widthArg !== undefined && !Number.isInteger(Number(widthArg))) {
    console.error('Width must be an integer');
    process.exit(1);
}

const heightArg = args.long['height'] || args.short['h'];

if (heightArg !== undefined && !Number.isInteger(Number(heightArg))) {
    console.error('Height must be an integer');
    process.exit(1);
}

const fpsArg = args.long['fps'] || args.short['f'];

if (fpsArg !== undefined && !Number.isInteger(Number(fpsArg))) {
    console.error('FPS must be an integer');
    process.exit(1);
}

try {
    const debugArg = args.long['debug'] !== undefined || args.short['d'] !== undefined ? parseBooleanArg(args.long['debug'] || args.short['d'], 'Debug must be a boolean') : false;
    const archiveArg = args.long['archive'] !== undefined || args.short['a'] !== undefined ? parseBooleanArg(args.long['archive'] || args.short['a'], 'Archive must be a boolean') : false;
    const compressArg = args.long['compress'] !== undefined || args.short['c'] !== undefined ? parseBooleanArg(args.long['compress'] || args.short['c'], 'Compress must be a boolean') : false;

    const width = widthArg ? Number(widthArg) : 64;
    const height = heightArg ? Number(heightArg) : (240 / 320) * width;

    const fps = fpsArg ? Number(fpsArg) : 10;

    const input = args.long['input'] || args.short['i'];
    const ext = path.extname(input);

    const endOnLastFrameArg = args.long['end-on-last-frame'] !== undefined || args.short['e'] !== undefined ? parseBooleanArg(args.long['end-on-last-frame'] || args.short['e'], 'End on last frame must be a boolean') : ext !== '.gif';

    const filename = input.replace(new RegExp(`(${escapeRegExp(ext)})$`), '');

    const debug = debugArg ?? false;
    const archive = archiveArg ?? false;
    const compress = compressArg ?? false;
    const endOnLastFrame = endOnLastFrameArg ?? ext !== '.gif';

    videoToFrames(input, fps);
    resizeFrames(filename, width, height, fps);
    frameToHeader(filename, path.join('frames', filename, `resized-${fps}fps-${width}x${height}`), [width, height], fps, endOnLastFrame, {
        archive,
        compress
    }, debug);
} catch (e) {
    console.error(e);
    process.exit(1);
}
