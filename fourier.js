const drawcanvas = document.getElementById("fourierdrawcanvas")
const canvascontext = drawcanvas.getContext("2d")

const animcanvas = document.getElementById("fourieranimcanvas")

const generatebutton = document.getElementById("generatebutton")
const resetbutton = document.getElementById("resetbutton")

const gridsize = 156

let cellsize
let drawing = false
let finished = false
let lastcell = null
let points = []
let fourier = []
let trail = []
let recordedframes = []
let playbackindex = 0
let playbackspeed = 0.3

function resizecanvas() {
    let maxsize

    if (window.matchMedia("(max-width: 768px)").matches) {
        maxsize = 250
    } else {
        maxsize = 500
    }
    
    const size = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.9, maxsize)

    drawcanvas.width = size
    drawcanvas.height = size
    animcanvas.width = size
    animcanvas.height = size

    cellsize = size / gridsize

    redraw()
}

window.addEventListener("resize", resizecanvas)
resizecanvas()

function getcell(x, y) {
    return {row: Math.floor(y / cellsize), col: Math.floor(x / cellsize)}
}

function drawpixel(row, col) {
    canvascontext.fillStyle = "black"
    canvascontext.fillRect(col * cellsize, row * cellsize, cellsize, cellsize)
}

function clearcanvas() {
    canvascontext.clearRect(0, 0, drawcanvas.width, drawcanvas.height)
}

function redraw() {
    clearcanvas()

    for (const p of points) drawpixel(p.row, p.col)
}

// bresenhams line algorithm
function getlinepixels(x1, y1, x2, y2) {
    const pixels = []

    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)

    const sx = (x1 < x2) ? 1 : -1
    const sy = (y1 < y2) ? 1 : -1

    let err = dx - dy

    while (true) {
        pixels.push({row: y1, col: x1})

        if (x1 === x2 && y1 === y2) break

        const e2 = 2 * err

        if (e2 > -dy) {
            err -= dy
            x1 += sx
        }

        if (e2 < dx) {
            err += dx
            y1 += sy
        }
    }

    return pixels
}

function drawline(c1, c2) {
    const line = getlinepixels(c1.col, c1.row, c2.col, c2.row)

    for (const p of line) {
        const last = points[points.length - 1]

        if (!last || last.row !== p.row || last.col !== p.col) {
            points.push(p)

            drawpixel(p.row, p.col)
        }
    }
}

function getpointerpos(e) {
    const rect = drawcanvas.getBoundingClientRect()

    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    if (x < 0) x = 0
    if (y < 0) y = 0
    if (x > drawcanvas.width - 1) x = drawcanvas.width - 1
    if (y > drawcanvas.height - 1) y = drawcanvas.height - 1

    return {x, y}
}

drawcanvas.addEventListener("pointerdown", e => {
    if (finished) return

    drawing = true

    drawcanvas.setPointerCapture(e.pointerId)

    const pos = getpointerpos(e)

    lastcell = getcell(pos.x, pos.y)

    points.push(lastcell)

    drawpixel(lastcell.row, lastcell.col)
})

drawcanvas.addEventListener("pointermove", e => {
    if (!drawing || finished) return

    const pos = getpointerpos(e)
    const cell = getcell(pos.x, pos.y)

    if (cell.row !== lastcell.row || cell.col !== lastcell.col) {
        drawline(lastcell, cell)

        lastcell = cell
    }
})

drawcanvas.addEventListener("pointerup", e => {
    drawing = false
    finished = true
    lastcell = null

    drawcanvas.releasePointerCapture(e.pointerId)
})

drawcanvas.addEventListener("pointercancel", () => {
    drawing = false
    lastcell = null
})

resetbutton.onclick = () => {
    points = []

    finished = false
    lastcell = null

    trail = []
    recordedframes = []
    playbackindex = 0

    clearcanvas()

    const ctx = animcanvas.getContext("2d")
    ctx.clearRect(0, 0, animcanvas.width, animcanvas.height)
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

function resamplepath(path, count) {
    let total = 0

    for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i])
    
    const step = total / count

    let acc = 0
    let out = [path[0]]
    let i = 1
    let prev = path[0]

    while (i < path.length && out.length < count) {
        const d = dist(prev, path[i])

        if (acc + d >= step) {
            const t = (step - acc) / d
            const nx = prev.x + t * (path[i].x - prev.x)
            const ny = prev.y + t * (path[i].y - prev.y)
            const p = {x: nx, y: ny}

            out.push(p)
            prev = p
            acc = 0
        } else {
            acc += d
            prev = path[i]
            i++
        }
    }

    return out
}

function centerpath(path) {
    let sx = 0
    let sy = 0

    for (const p of path) {sx += p.x; sy += p.y}

    const cx = sx / path.length
    const cy = sy / path.length

    return path.map(p => ({x: p.x - cx, y: p.y - cy}))
}

function dft(path) {
    const n = path.length
    const out = []

    for (let k = 0; k < n; k++) {
        let re = 0
        let im = 0

        for (let i = 0; i < n; i++) {
            const angle = 2 * Math.PI * k * i / n

            re += path[i].x * Math.cos(angle) + path[i].y * Math.sin(angle)
            im += -path[i].x * Math.sin(angle) + path[i].y * Math.cos(angle)
        }

        re /= n
        im /= n

        let nk = k

        if (k > n / 2) nk = k - n

        out.push({freq: nk, amp: Math.hypot(re, im), phase: Math.atan2(im, re), re, im})
    }

    return out
}

function recordanimation() {
    const steps = 200

    recordedframes = []

    let simtime = 0

    for (let s = 0; s < steps; s++) {
        let x = animcanvas.width / 2
        let y = animcanvas.height / 2

        const frame = []

        for (const v of fourier) {
            const angle = v.freq * simtime + v.phase
            const nx = x + Math.cos(angle) * v.amp * cellsize
            const ny = y + Math.sin(angle) * v.amp * cellsize

            frame.push({x: nx, y: ny})

            x = nx
            y = ny
        }

        recordedframes.push(frame)

        simtime += (2 * Math.PI) / steps
    }
}

function playrecorded() {
    if (!recordedframes.length) return

    const ctx = animcanvas.getContext("2d")
    ctx.fillStyle = "rgba(255, 255, 255, 0.1"
    ctx.fillRect(0, 0, animcanvas.width, animcanvas.height)

    let x = animcanvas.width / 2
    let y = animcanvas.height / 2

    const i = Math.floor(playbackindex)
    const j = (i + 1) % recordedframes.length
    const t = playbackindex - i

    const frameA = recordedframes[i]
    const frameB = recordedframes[j]

    ctx.strokeStyle = "rgba(155, 0, 155, 0.3)"
    ctx.lineWidth = 5

    for (let k = 0; k < frameA.length; k++) {
        const px = frameA[k].x * (1 - t) + frameB[k].x * t
        const py = frameA[k].y * (1 - t) + frameB[k].y * t

        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(px, py)
        ctx.stroke()

        ctx.fillRect(px - 2, py - 2, 4, 4)

        x = px
        y = py
    }

    trail.push({x, y})

    ctx.strokeStyle = "black"
    ctx.lineWidth = 3
    ctx.beginPath()

    for (let m = 0; m < trail.length; m++) {
        const p = trail[m]

        if (m === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
    }

    ctx.stroke()

    playbackindex += playbackspeed

    if (playbackindex >= recordedframes.length) {
        playbackindex = 0
        trail = []
    }

    requestAnimationFrame(playrecorded)
}

generatebutton.onclick = () => {
    if (points.length < 2) return

    const path = points.map(p => ({x: p.col + 0.5, y: p.row + 0.5}))
    const resampled = centerpath(resamplepath(path, 200))

    fourier = dft(resampled).sort((a, b) => b.amp - a.amp).slice(0, 1000)

    trail = []
    playbackindex = 0

    recordanimation()
    playrecorded()
}