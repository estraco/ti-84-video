import cp from 'child_process';
import fs from 'fs';
import path from 'path';

function videoToFrames(videoPath: string, fps: number) {
    const videoName = path.basename(videoPath).split('.')[0];
    const framePath = path.join('frames', videoName, 'normal', 'frame_%d.png');
    const frameDir = path.dirname(framePath);

    if (fs.existsSync(frameDir)) {
        fs.rmSync(frameDir, { recursive: true });
    }

    fs.mkdirSync(frameDir, { recursive: true });

    const cmd = `ffmpeg -i ${videoPath} -vf fps=${fps} ${framePath}`;

    cp.execSync(cmd, { stdio: 'inherit' });
}

function resizeFrames(videoName: string, width: number, height: number) {
    // get the first frame to get the dimensions
    const framePath = path.join('frames', videoName, 'normal', 'frame_1.png');

    const dimcmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${framePath}`;

    const dimensions = cp.execSync(dimcmd).toString().split('x');

    const frameWidth = parseInt(dimensions[0]);
    const frameHeight = parseInt(dimensions[1]);

    const widthLarger = frameWidth / 320 > frameHeight / 240;

    const resizePath = path.join('frames', videoName, `resized-${width}x${height}`, 'frame_%d.png');
    const resizeDir = path.dirname(resizePath);

    if (fs.existsSync(resizeDir)) {
        fs.rmSync(resizeDir, { recursive: true });
    }

    fs.mkdirSync(resizeDir, { recursive: true });

    const cmd = `ffmpeg -i ${path.join('frames', videoName, 'normal', 'frame_%d.png')} -vf scale=${widthLarger ? width : -1}:${widthLarger ? -1 : height} ${resizePath}`;

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

    fs.writeFileSync(path.join('frames', videoName, `resized-${size[0]}x${size[1]}`, `${videoName}.yaml`), format);

    const cmd = `convimg -i ${path.resolve(path.join('frames', videoName, `resized-${size[0]}x${size[1]}`, `${videoName}.yaml`))}`;

    cp.execSync(cmd, {
        stdio: 'inherit',
        cwd: path.join('frames', videoName, `resized-${size[0]}x${size[1]}`)
    });

    const calcFolder = path.join('calc', `${videoName}-${size[0]}x${size[1]}`);

    if (!fs.existsSync(calcFolder)) {
        fs.mkdirSync(calcFolder, { recursive: true });
    }

    const frameList = fs.readdirSync(path.join('frames', videoName, `resized-${size[0]}x${size[1]}`))
        .filter((file) => file.endsWith('.h') && file.startsWith('frame_'))
        .sort((a, b) => parseInt(a.split('_')[1].split('.')[0]) - parseInt(b.split('_')[1].split('.')[0]))
        .map((file) => file.split('.')[0]);

    const frameCount = frameList.length;

    console.log(`frameCount: ${frameCount}`);
    console.log(`fps: ${fps}`);
    console.log(`endOnLastFrame: ${endOnLastFrame}`);
    console.log(`makefileOptions.archive: ${makefileOptions.archive}`);
    console.log(`makefileOptions.compress: ${makefileOptions.compress}`);

    const main = `#include <ti/getcsc.h>
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
    
include $(shell cedev-config --makefile)`;

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

    const filesToCopy = fs.readdirSync(path.join('frames', videoName, `resized-${size[0]}x${size[1]}`)).filter((file) => file.endsWith('.h') || file.endsWith('.c'));

    for (const file of filesToCopy) {
        fs.copyFileSync(path.join('frames', videoName, `resized-${size[0]}x${size[1]}`, file), path.join(calcFolder, 'src', 'gfx', file));
    }
}

const width = 64;
const height = Math.round((240 / 320) * width);

const fps = 20;

// const filename = 'troll';
// // eslint-disable-next-line @typescript-eslint/no-inferrable-types
// const ext: string = '.gif';

const filename = process.argv[2];

if (!filename) {
    console.error('No filename provided\n' +
        `Usage: ${process.argv[0]} ${process.argv[1]} <filename>`);
    process.exit(1);
}

const ext = path.extname(filename);

if (!fs.existsSync(filename)) {
    console.error(`File ${filename} does not exist`);
    process.exit(1);
}

videoToFrames(filename + ext, fps);
resizeFrames(filename, width, height);
frameToHeader(filename, path.join('frames', filename, `resized-${width}x${height}`), [width, height], fps, ext !== '.gif', {
    archive: true,
    compress: true
}, false);
