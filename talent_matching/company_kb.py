"""Seed company list for the company-classifier agent.

Deliberately India-heavy, because "service stint" is mostly an India hiring filter.
Recruiters should extend this list as they meet new companies. Every addition makes the
LLM fallback cheaper and the decisions more consistent.
"""
import re
from typing import Dict, Optional

from .models import CompanyType

S, B2B, AI, B2C, GCC, BIG = (
    CompanyType.SERVICES, CompanyType.B2B_SAAS, CompanyType.AI_NATIVE,
    CompanyType.B2C, CompanyType.GCC, CompanyType.BIG_TECH,
)

_SEED: Dict[CompanyType, list] = {
    S: [
        "tcs", "tata consultancy services", "infosys", "wipro", "hcl", "hcltech", "tech mahindra",
        "cognizant", "accenture", "capgemini", "ltimindtree", "mindtree", "lti", "larsen toubro infotech",
        "mphasis", "hexaware", "persistent systems", "zensar", "ibm consulting", "ibm gbs", "deloitte",
        "ey", "ernst young", "pwc", "kpmg", "ntt data", "dxc", "virtusa", "birlasoft", "coforge",
        "sonata software", "cyient", "epam", "globant", "thoughtworks", "publicis sapient", "sapient",
        "nagarro", "happiest minds", "l&t technology services", "ust global", "ust", "mastek", "kpit",
        # "AI services" firms: they sound like AI companies, but they bill client projects
        "fractal", "fractal analytics", "tiger analytics", "quantiphi", "latentview", "mu sigma",
        "tredence", "sigmoid", "affine",
    ],
    B2B: [
        "freshworks", "zoho", "chargebee", "postman", "browserstack", "razorpay", "atlassian",
        "salesforce", "servicenow", "workday", "darwinbox", "leadsquared", "hasura", "innovaccer",
        "icertis", "highradius", "whatfix", "moengage", "clevertap", "sprinklr", "druva", "gupshup",
        "rocketlane", "atlan", "mindtickle", "exotel", "databricks", "snowflake", "zeta", "setu",
        "m2p fintech", "keka", "kissflow", "chargebee", "netcore", "capillary technologies",
    ],
    AI: [
        "yellow.ai", "yellow ai", "haptik", "observe.ai", "observe ai", "uniphore", "sarvam ai",
        "sarvam", "glean", "anthropic", "openai", "cohere", "rasa", "gnani.ai", "level ai",
        "ema", "simplismart", "composio", "sprinklr ai", "vymo",
    ],
    B2C: [
        "swiggy", "zomato", "flipkart", "paytm", "meesho", "myntra", "phonepe", "cred", "ola",
        "uber", "dream11", "byjus", "byju's", "unacademy", "nykaa", "zepto", "blinkit", "sharechat",
        "inmobi glance", "glance", "makemytrip", "groww", "zerodha", "upstox", "lenskart", "physicswallah",
    ],
    GCC: [
        "goldman sachs", "jpmorgan", "jpmorgan chase", "jp morgan", "morgan stanley", "wells fargo",
        "american express", "walmart global tech", "target", "lowe's", "lowes", "tesco", "hsbc",
        "barclays", "deutsche bank", "standard chartered",
    ],
    BIG: [
        "google", "microsoft", "amazon", "aws", "meta", "apple", "adobe", "oracle", "ibm",
        "intuit", "linkedin", "nvidia", "sap", "cisco", "qualcomm",
    ],
}

_SUFFIXES = re.compile(
    r"\b(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|technologies|technology|"
    r"software|solutions|labs|india|global services|co)\b\.?"
)


def normalize(name: str) -> str:
    n = name.lower().replace("&", " & ").strip()
    n = _SUFFIXES.sub(" ", n)
    n = re.sub(r"[^a-z0-9&.' ]", " ", n)
    return re.sub(r"\s+", " ", n).strip(" .")


KB: Dict[str, CompanyType] = {normalize(alias): ctype for ctype, aliases in _SEED.items() for alias in aliases}
# Service companies win any alias collision; a false "services" hit gets caught at HOLD review.
KB.update({normalize(a): S for a in _SEED[S]})


def lookup(company: str) -> Optional[CompanyType]:
    return KB.get(normalize(company))
