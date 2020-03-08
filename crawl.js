const puppeteer = require('puppeteer')
const { default: PQueue } = require('p-queue')
const retry = require('p-retry')

const fs = require('fs')
const path = require('path')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function createBrowser () {
  return puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })
}

async function main (baseurl = 'https://example.com', seen = new Set()) {
  const queue = new PQueue({ concurrency: 5, timeout: 90000 })

  const linksToCrawls = [baseurl]
  queue.add(() => crawl(baseurl, { linksToCrawls, seen, queue }))

  async function crawl (link, { linksToCrawls = [], seen = new Set(), queue = new PQueue({ concurrency: 10, timeout: 60000 }) }) {
    let browser
    let page
    try {
      const filepath = linkToFilepath(link)
      console.log('🤖  processing', link)
      if (!link || seen.has(link)) return // console.log('seen', link)
      seen.add(link)
      if (exists(filepath)) {
        console.log('exists', filepath)
        return
      }

      console.log('✨  new link', link)
      const waitTime = parseInt(Math.random() * 2000, 10)
      await new Promise(resolve => setTimeout(resolve, waitTime))

      browser = await createBrowser()
      page = await browser.newPage()

      console.log('🕸   crawling', link)

      await page.goto(link, { waitUntil: 'networkidle2', timeout: 10000 }).catch(_ => {})
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(_ => {})

      save(link, await page.content())

      let links = await page.evaluate((baseurl) => [...document.querySelectorAll(`[href^="/"],[href^="${baseurl}"]`)].map(a => a.getAttribute('href')), baseurl)
      links = links.map(link => link.startsWith(baseurl) ? link : `${baseurl.replace(/\/$/, '')}${link}`)
      links = links.filter(link => !/#.*$/.test(link))
      const newLinks = links.filter(l => !seen.has(l))

      console.log('✅  completed', link)
      newLinks.length > 0 && console.log('🕵🏻‍♂️  found new links', newLinks.join(', '))
      linksToCrawls.push(...newLinks)

      newLinks.forEach(l =>
        queue.add(() => retry(() => crawl(l, { linksToCrawls, seen, queue })))
      )

      console.log('progress', seen.size, 'crawled', ' ❍ queue size', queue.size, ' ❍ pending', queue.pending)
    } catch (err) {
      console.error('recovering from error', err.message)

      await queue.pause()
      console.error('oops', err.message)
      page && await page.close()
      browser && await browser.close().catch(_ => {})
      await queue.start()

      throw err
    }
  }

  await queue.onIdle()
}

function mkdir (dirpath) { try { fs.mkdirSync(dirpath, { recursive: true }) } catch (err) {} }
function writeFile (filepath, content) { try { fs.writeFileSync(filepath, content, { encoding: 'utf8' }) } catch (err) { console.error(filepath, err.message) } }
function exists (filepath) { try { return fs.existsSync(filepath) } catch (err) { return false } }

function save (link, content) {
  const filepath = linkToFilepath(link)
  const folderpath = path.resolve(__dirname, filepath, '..')
  mkdir(folderpath)
  writeFile(filepath, content)
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
