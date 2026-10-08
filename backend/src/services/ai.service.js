const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {


    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
`

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(interviewReportSchema),
        }
    })

    return JSON.parse(response.text)


}



async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })
    await page.emulateMediaType("print")
    await page.addStyleTag({ content: `
        @page { size: A4; margin: 0; }
        html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }
        body {
            position: relative !important;
            display: block !important;
            box-sizing: border-box !important;
            color: #222 !important;
            background: #fff !important;
            font-family: Arial, Helvetica, sans-serif !important;
            font-size: 10.5pt !important;
            line-height: 1.24 !important;
        }
        #resume-page-content {
            position: absolute !important;
            top: 12mm !important;
            left: 12mm !important;
            width: 186mm !important;
            box-sizing: border-box !important;
            transform-origin: top left !important;
        }
        #resume-page-content * { box-sizing: border-box !important; }
        #resume-page-content h1 {
            margin: 0 0 3mm !important;
            font-size: 22pt !important;
            line-height: 1.12 !important;
        }
        #resume-page-content h2 {
            margin: 4mm 0 1.5mm !important;
            font-size: 12.5pt !important;
            line-height: 1.16 !important;
        }
        #resume-page-content h3, #resume-page-content h4 {
            margin: 2.5mm 0 1mm !important;
            font-size: 11pt !important;
            line-height: 1.18 !important;
        }
        #resume-page-content p {
            margin: 0 0 1.6mm !important;
            font-size: 10.5pt !important;
            line-height: 1.24 !important;
        }
        #resume-page-content ul, #resume-page-content ol {
            margin: 0 0 1.8mm !important;
            padding-left: 5mm !important;
        }
        #resume-page-content li {
            margin: 0 0 0.8mm !important;
            font-size: 10.25pt !important;
            line-height: 1.23 !important;
        }
        #resume-page-content section,
        #resume-page-content article,
        #resume-page-content [class~="section"] {
            margin-bottom: 3.5mm !important;
        }
        #resume-page-content table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9.5pt !important;
        }
    ` })
    await page.evaluate(async () => {
        await document.fonts.ready

        const placeholderPatterns = [
            /candidate\s*@\s*email\.com/gi,
            /\+?\d{0,3}[\s().-]*X(?:[\s().-]*X){5,}/gi,
            /(?:github\.com\/|linkedin\.com\/in\/)(?:username|your[-_ ]?username)/gi,
            /\[\s*year\s*\]/gi
        ]
        const containsPlaceholder = (value) => placeholderPatterns.some(pattern => {
            pattern.lastIndex = 0
            return pattern.test(value)
        })

        for (const link of document.body.querySelectorAll("a")) {
            if (containsPlaceholder(link.textContent) || containsPlaceholder(link.getAttribute("href") || "")) {
                link.remove()
            }
        }

        const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const textNodes = []
        while (textWalker.nextNode()) textNodes.push(textWalker.currentNode)

        for (const node of textNodes) {
            let value = node.nodeValue
            for (const pattern of placeholderPatterns) {
                pattern.lastIndex = 0
                value = value.replace(pattern, "")
            }
            value = value.replace(/\b(?:e-?mail|phone|mobile|github|git\s*hub|linkedin|linked\s*in)\s*[:\uFF1A]\s*(?=$|[|\u2022,;])/gi, "")
            value = value.replace(/^\s*[|\u2022,;]\s*|\s*[|\u2022,;]\s*$/g, "")
            node.nodeValue = value
        }

        for (const element of [...document.body.querySelectorAll("a, span, p, li")].reverse()) {
            if (!element.textContent.trim() && !element.querySelector("img, svg")) element.remove()
        }

        const content = document.createElement("div")
        content.id = "resume-page-content"
        while (document.body.firstChild) {
            content.appendChild(document.body.firstChild)
        }
        document.body.appendChild(content)

        const maxWidth = 186 * 96 / 25.4
        const maxHeight = 273 * 96 / 25.4
        const width = Math.max(content.scrollWidth, content.getBoundingClientRect().width)
        const height = Math.max(content.scrollHeight, content.getBoundingClientRect().height)
        const scale = Math.min(1, maxWidth / width, maxHeight / height)
        content.style.transform = `scale(${scale})`
    })

    const pdfBuffer = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of the resume should read like a human-written resume, with a simple, professional, ATS-friendly design.
                        Keep every relevant section and all important facts, dates, skills, and achievements from the supplied resume. Make wording concise to fit the available space; do not drop an existing section or important information to save space.
                        Use the supplied Resume and Self Description as the only sources for the candidate's name, contact details, education, employers, dates, links, qualifications, and achievements. Reuse those details as provided; never infer or invent missing personal information. Omit any unavailable field entirely, including its label or icon. Never emit example, demo, or placeholder details such as candidate@email.com, +91-XXXXXXXXXX, github.com/username, linkedin.com/in/username, [Year], or similar stand-ins. Use the Job Description only to tailor emphasis, never as a source of candidate details.
                        Format the resume to fit exactly one A4 page when converted to PDF. Use compact section spacing, clear headings, short bullet points, and a readable body font around 9pt. Use a white background and avoid large decorative elements, excessive margins, and page-break rules.
                    `

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    })


    const jsonContent = JSON.parse(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf } 