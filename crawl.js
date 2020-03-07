const puppeteer = require('puppeteer')
const { default: PQueue } = require('p-queue')

const fs = require('fs')
const path = require('path')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (baseurl = 'https://google.com', seen = new Set()) {
  const queue = new PQueue({ concurrency: 10 })
  const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })
  const basepath = baseurl.replace(/:/g, '').replace(/\//g, '|')

  mkdir(path.resolve(__dirname, 'sites'))
  mkdir(path.resolve(__dirname, 'sites', basepath))

  const linksToCrawls = [baseurl]
  queue.add(() => crawl(baseurl, { linksToCrawls, seen, queue }))

  async function crawl (link, { linksToCrawls, seen, queue }) {
    const filepath = path.resolve(__dirname, 'sites', basepath, link.replace(/\//g, '|')) + '.html'
    if (fileExists(filepath)) return console.log('  ..already crawled', link)
    console.log('processing', link)
    if (!link || seen.has(link)) return console.log('  ..seen', link)

    const page = await browser.newPage()

    console.log('  ..crawling', link)
    seen.add(link)

    await page.goto(link.startsWith('/') ? `${baseurl}${link}` : link)
    await page.waitFor(3000)

    writeFile(filepath, await page.content())

    const links = await page.evaluate((baseurl) => [...document.querySelectorAll(`a[href^="/"]`)].map(a => a.getAttribute('href')), baseurl)
    const newLinks = links.filter(l => !seen.has(l))

    console.log('  ..completed', link)
    newLinks.length > 0 && console.log('  ..newLinks', newLinks.join(', '))
    linksToCrawls.push(...newLinks)

    newLinks.forEach(l =>
      queue.add(() => crawl(l, { linksToCrawls, seen, queue })))

    console.log('progress', seen.size, 'crawled', 'queue size', queue.size, 'pending', queue.pending)
    await page.close()
  }
  await queue.onIdle()
  await browser.close()
}

function mkdir (dirpath) { try { fs.mkdirSync(dirpath) } catch (err) {} }
function writeFile (filepath, content) { try { fs.writeFileSync(filepath, content, { encoding: 'utf8' }) } catch (err) { console.error(filepath, err.message) } }
function fileExists (filepath) { try { fs.statSync(filepath); return true } catch (err) { return false } }
