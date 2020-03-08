const { browser: { createBrowser } } = require('mega-scraper')
const { default: PQueue } = require('p-queue')
const retry = require('p-retry')

const fs = require('fs')
const path = require('path')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (baseurl = 'https://example.com', seen = new Set(), completed = new Set()) {
  process.setMaxListeners(100)
  const queue = new PQueue({ concurrency: 10, timeout: 90000 })

  queue.add(() => crawl(baseurl, { baseurl, seen, completed, queue }))

  const handle = setInterval(() => {
    console.log('seen urls', seen.size, ' ❍  completed', completed.size, ' ❍ queue size', queue.size, ' ❍ pending', queue.pending)
  }, 1000 * 5)

  await queue.onIdle()
  clearInterval(handle)
}

async function crawl (link, { baseurl, seen = new Set(), completed = new Set(), queue = new PQueue({ concurrency: 10, timeout: 60000 }) }) {
  let browser
  let page
  try {
    const filepath = linkToFilepath(link)
    console.log('🤖  processing', link, filepath)
    if (exists(filepath)) return console.log('  ..exists', filepath)

    browser = await createBrowser({ browserWSEndpoint: 'ws://localhost:3000', stylesheets: false, images: false, javascript: false })
    page = await browser.newPage()

    console.log('🕸   crawling', link)

    await page.goto(link, { waitUntil: 'networkidle2', timeout: 10000 }).catch(_ => {})
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(_ => {})

    save(link, await page.content())
    completed.add(link)

    console.log('✅  completed', link)

    const links = await page.evaluate((baseurl) => [...document.querySelectorAll(`a[href^="/"],a[href^="${baseurl}"]`)].map(a => a.getAttribute('href')), baseurl)
    links
      .filter(link => !link.startsWith('//'))
      .map(link => link.startsWith(baseurl) ? link : `${baseurl.replace(/\/$/, '')}${link}`)
      .filter(link => !/#.*$/.test(link))
      .filter(l => !seen.has(l))
      .forEach(l => {
        seen.add(l)
        queue.add(() => retry(() => crawl(l, { baseurl, seen, completed, queue })))
      })

    page && await page.close().catch(_ => {})
    browser && await browser.close().catch(_ => {})
  } catch (err) {
    console.error('recovering from error', err.message)
    await queue.pause()

    page && await page.close().catch(_ => {})
    browser && await browser.close().catch(_ => {})
    console.error('oops', err.message)
    await queue.start()

    throw err
  }
}

function mkdir (dirpath) { try { fs.mkdirSync(dirpath, { recursive: true }) } catch (err) {} }
function writeFile (filepath, content, options = { encoding: 'utf8' }) { try { fs.writeFileSync(filepath, content, options) } catch (err) { console.error(filepath, err.message) } }
function exists (filepath) { try { return fs.existsSync(filepath) } catch (err) { return false } }

function save (link, content) {
  const filepath = linkToFilepath(link)
  const folderpath = path.resolve(__dirname, filepath, '..')
  mkdir(folderpath)
  const encoding = /\.[png|jpg]$/.test(filepath) ? 'binary' : 'utf8'
  writeFile(filepath, content, { encoding })
}

function linkToFilepath (link) {
  const linkWithoutHost = link.replace(/https+:\/\//i, '')
  const segments = linkWithoutHost.split('/')
  let filepath = path.resolve(__dirname, 'sites', ...segments, 'index.html')
  if (/\./g.test(segments[segments.length - 1])) {
    filepath = path.resolve(__dirname, 'sites', ...segments)
  }
  return filepath
}
