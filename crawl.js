const puppeteer = require('puppeteer')
const { default: PQueue } = require('p-queue')
const retry = require('p-retry')

const fs = require('fs')
const path = require('path')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (baseurl = 'https://google.com', seen = new Set()) {
  const queue = new PQueue({ concurrency: 10 })
  const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })

  const linksToCrawls = [baseurl]
  queue.add(() => retry(() => crawl(baseurl, { linksToCrawls, seen, queue })))

  async function crawl (link, { linksToCrawls, seen, queue }) {
    link = link.startsWith('/') ? `${baseurl}${link}` : link
    console.log('processing', link)
    if (!link || seen.has(link)) return console.log('  ..seen', link)

    const waitTime = parseInt(Math.random() * 2000, 10)
    await new Promise(resolve => setTimeout(resolve, waitTime))

    const page = await browser.newPage()

    console.log('  ..crawling', link)
    seen.add(link)

    await page.goto(link)
    await page.waitFor(3000)

    save(link, baseurl, await page.content())

    const links = await page.evaluate((baseurl) => [...document.querySelectorAll(`a[href^="/"]`)].map(a => a.getAttribute('href')), baseurl)
    const newLinks = links.filter(l => !seen.has(l))

    console.log('  ..completed', link)
    newLinks.length > 0 && console.log('  ..newLinks', newLinks.join(', '))
    linksToCrawls.push(...newLinks)

    newLinks.forEach(l =>
      queue.add(() => retry(() => crawl(l, { linksToCrawls, seen, queue }))))

    console.log('progress', seen.size, 'crawled', 'queue size', queue.size, 'pending', queue.pending)
    await page.close()
  }
  await queue.onIdle()
  await browser.close()
}

function mkdir (dirpath) { try { fs.mkdirSync(dirpath, { recursive: true }) } catch (err) {} }
function writeFile (filepath, content) { try { fs.writeFileSync(filepath, content, { encoding: 'utf8' }) } catch (err) { console.error(filepath, err.message) } }

function save (link, baseurl, content) {
  const filepath = linkToFilepath(link, baseurl)
  const folderpath = path.resolve(__dirname, filepath, '..')
  mkdir(folderpath)
  writeFile(filepath, content)
}

function linkToFilepath (link, baseurl) {
  const linkWithoutHost = link.replace(/https+:\/\//i, '')
  const segments = linkWithoutHost.split('/')
  const filepath = path.resolve(__dirname, 'sites', ...segments, 'index.html')
  return filepath
}
