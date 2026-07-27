## Update Jul 27 14:20 


# چارچوب ریپازیتوری و استقرار Arad CRM‑OS

**مخاطب:** تیم محصول، توسعه، DevOps و QA  
**وضعیت:** سند مبنا برای شروع طراحی و پیاده‌سازی  
**نسخه:** 1.0  
**تاریخ:** ۱۴۰۵/۰۵/۰۵ — 2026-07-27

---

## 1. هدف سند

این سند چارچوب مورد توافق برای ساخت، تفکیک و استقرار **Arad CRM‑OS** را مشخص می‌کند. هدف آن این است که:

- یک هسته مشترک CRM برای همه صنایع داشته باشیم؛
- برای هر صنعت، سرفیس، واژگان، گردش‌کار و PWA تخصصی ارائه کنیم؛
- از ایجاد Fork مستقل برای هر صنعت یا مشتری جلوگیری کنیم؛
- هر سرفیس بتواند مستقل Build و Deploy شود؛
- استقرار اولیه ساده و کم‌هزینه باشد، اما امکان جداسازی سرویس‌ها و مشتریان حساس در آینده حفظ شود؛
- مرز Arad CRM‑OS با Neksta، Mizro، Arad Commerce OS، سیستم پرداخت و حسابداری روشن بماند.

این سند درباره انتخاب نهایی زبان، فریم‌ورک، دیتابیس یا سرویس ابری تصمیم‌گیری نمی‌کند. تیم فنی می‌تواند بهترین ابزار را انتخاب کند، مشروط بر اینکه مرزها و اصول این سند حفظ شوند.

---

## 2. تعریف محصول

Arad CRM‑OS صرفاً دفتر ثبت مشتری یا یک CRM عمومی نیست. این محصول یک:

> **سیستم‌عامل فروش، ارتباط با مشتری و عملیات درآمد برای کسب‌وکارهای کوچک و متوسط**

است که از جذب سرنخ تا فروش، ارائه خدمت، پیگیری، نگهداشت، تمدید، فروش مجدد و تحلیل درآمد را پوشش می‌دهد.

مدل محصول:

```text
Shared CRM Core
    + Industry Package
    + Industry Surface
    + Tenant Configuration
```

هر Vertical صنعتی یک محصول واقعی با UI، واژگان، گردش‌کار و قواعد حوزه خود است، اما از هسته مشترک استفاده می‌کند و Fork جداگانه محسوب نمی‌شود.

---

## 3. تصمیم‌های معماری قفل‌شده

موارد زیر تصمیم‌های پایه هستند و نباید بدون بازبینی این سند تغییر کنند:

1. Arad CRM‑OS یک Monorepo اختصاصی برای CRM Core، ماژول‌های مشترک و سرفیس‌های صنعتی CRM دارد.
2. هر سرفیس صنعتی یک Application مستقل و قابل Build و Deploy است.
3. Core نباید به UI یا واژگان یک صنعت خاص وابسته شود.
4. مفاهیم پزشکی، بیمه، تعمیرگاه و سایر صنایع در Industry Package مربوط به خودشان قرار می‌گیرند.
5. برای هر صنعت Fork جداگانه از CRM ساخته نمی‌شود.
6. مشتریان معمول SMB به‌صورت Multi-tenant پشتیبانی می‌شوند.
7. امکان استقرار اختصاصی برای مشتریان حساس یا بزرگ باید حفظ شود.
8. هر Vertical یک PWA مستقل با Manifest، Service Worker، نام، لوگو و Scope مستقل دارد.
9. تمام ساب‌دامین‌ها می‌توانند در شروع به یک سرور و Reverse Proxy مشترک متصل شوند.
10. آدرس عمومی اپ‌ها مستقل از محل استقرار است؛ انتقال یک اپ به سرور دیگر نباید URL آن را تغییر دهد.
11. Neksta، Mizro و Arad Commerce OS داخل Monorepo این CRM قرار نمی‌گیرند.
12. ارتباط محصولات مستقل فقط از طریق API استاندارد و Event Contract انجام می‌شود؛ Shared Table بین محصولات ممنوع است.
13. هر داده یک System of Record مشخص دارد.
14. CRM اطلاعات مالی مرتبط با مشتری، فروش، وصول، تمدید، پورسانت و Revenue Intelligence را نمایش می‌دهد، اما حسابداری رسمی داخل CRM ساخته نمی‌شود.
15. اطلاعات بالینی و حساس بیمار باید از داده عمومی CRM و دسترسی تیم فروش جدا بماند.

---

## 4. محدوده Monorepo

نام پیشنهادی ریپو:

```text
arad-crm-os
```

این ریپو شامل موارد زیر است:

- CRM Core
- API و Application Services مرتبط با CRM
- پنل Ops
- اپ عمومی CRM
- سرفیس‌های Clinic، Insurance و Auto
- ماژول Automation
- ماژول Communication
- Revenue Intelligence
- Sales Finance / Revenue Ledger
- Auth Client و کنترل دسترسی
- Design System و اجزای UI مشترک
- Industry Packages
- قراردادها، DTOها، SDKها و ابزارهای تست مرتبط با CRM

این ریپو شامل موارد زیر نیست:

- Neksta
- Mizro / Digital Menu
- Arad Commerce OS
- سیستم حسابداری رسمی
- سرویس‌های مستقل آینده که مالک Bounded Context دیگری هستند

این محصولات می‌توانند Package یا SDK قرارداد ارتباطی را مصرف کنند، اما نباید جداول دیتابیس یا منطق داخلی یکدیگر را مستقیماً استفاده کنند.

---

## 5. ساختار پیشنهادی Monorepo

ساختار زیر مرز مورد انتظار را نمایش می‌دهد. تیم فنی می‌تواند نام پوشه‌ها را با ابزار Monorepo انتخابی هماهنگ کند، اما تفکیک Application و Package باید حفظ شود.

```text
arad-crm-os/
├── apps/
│   ├── ops/
│   ├── app/
│   ├── clinic/
│   ├── insurance/
│   ├── auto/
│   ├── api/
│   └── workers/
│
├── packages/
│   ├── foundation/
│   ├── crm-core/
│   ├── automation/
│   ├── communication/
│   ├── revenue-intelligence/
│   ├── sales-finance/
│   ├── auth/
│   ├── tenancy/
│   ├── permissions/
│   ├── event-contracts/
│   ├── api-client/
│   ├── ui/
│   ├── vertical-clinic/
│   ├── vertical-insurance/
│   └── vertical-auto/
│
├── tooling/
│   ├── build/
│   ├── deploy/
│   ├── migrations/
│   └── test/
│
└── docs/
    ├── product/
    ├── architecture/
    ├── adr/
    ├── operations/
    └── security/
```

### 5.1 اپلیکیشن‌ها

| اپ | مسئولیت |
|---|---|
| `apps/ops` | کنترل‌پنل داخلی آراد برای مدیریت Tenantها، اشتراک‌ها، Featureها، پشتیبانی و عملیات |
| `apps/app` | CRM عمومی برای کسب‌وکارهایی که Vertical تخصصی ندارند |
| `apps/clinic` | سرفیس تخصصی پزشک، دندان‌پزشک، زیبایی و کلینیک |
| `apps/insurance` | سرفیس تخصصی نماینده، کارگزاری و تیم فروش بیمه |
| `apps/auto` | سرفیس تخصصی تعمیرگاه و خدمات خودرو |
| `apps/api` | API Gateway و Endpointهای CRM |
| `apps/workers` | پردازش Jobها، Automation، زمان‌بندی، Webhook و ارسال‌های غیرهمزمان |

### 5.2 Packageهای مشترک

| Package | مسئولیت |
|---|---|
| `crm-core` | مشتری، سازمان، Lead، Opportunity، Activity، Timeline، تیم فروش و قواعد عمومی |
| `automation` | Trigger، Wait، Condition، Action، Stop و نسخه‌بندی Flow |
| `communication` | قرارداد ارسال/دریافت پیام و اتصال Providerها |
| `revenue-intelligence` | گزارش درآمد، CLV، عملکرد فروش، تمدید و Next Best Action |
| `sales-finance` | نمای مالی مشتری، فروش، وصول، بدهی، پورسانت و حاشیه سود |
| `tenancy` | Organization، Workspace، Tenant Context و جداسازی داده |
| `permissions` | Role، Permission، Scope و کنترل دسترسی |
| `event-contracts` | زبان رسمی ارتباط میان محصولات و ماژول‌ها |
| `ui` | Design System و اجزای قابل استفاده مجدد |
| `vertical-*` | قواعد حوزه، واژگان، فرم‌ها، Flowها و Capabilityهای هر صنعت |

---

## 6. اصل استقلال Build و Deployment

قرار داشتن اپ‌ها در یک Monorepo به معنی یک Build یا یک Deployment مشترک نیست.

هر اپ باید:

- ورودی Build مستقل داشته باشد؛
- Environment Configuration مستقل داشته باشد؛
- Artifact یا Image مستقل تولید کند؛
- Pipeline تست و استقرار مستقل داشته باشد؛
- بدون Rebuild سایر سرفیس‌ها قابل انتشار باشد؛
- بتواند در آینده روی سرور یا زیرساخت مستقل قرار گیرد.

تغییر در Package مشترک باید فقط اپ‌های وابسته را وارد Pipeline تست و Build کند. تیم می‌تواند برای شروع همه اپ‌ها را با یک Release هماهنگ منتشر کند، اما معماری نباید این حالت را اجباری کند.

---

## 7. ساختار دامنه‌ها

ساختار دامنه مصوب:

| دامنه | کاربرد |
|---|---|
| `aradcrm.ir` | سایت معرفی، فروش و مستندات عمومی محصول |
| `ops.aradcrm.ir` | کنترل‌پنل داخلی آراد |
| `app.aradcrm.ir` | CRM عمومی |
| `clinic.aradcrm.ir` | PWA و سرفیس تخصصی کلینیک |
| `insurance.aradcrm.ir` | PWA و سرفیس تخصصی بیمه |
| `auto.aradcrm.ir` | PWA و سرفیس تخصصی تعمیرگاه |
| `api.aradcrm.ir` | API Gateway |
| `id.aradcrm.ir` | ورود یکپارچه و Identity |

### 7.1 قواعد دامنه

- Verticalها نباید با مسیرهایی مانند `app.aradcrm.ir/clinic` عرضه شوند.
- برای هر Vertical در شروع دامنه مستقل مانند `doctor-arad-crm.ir` خریداری نمی‌شود.
- نام دامنه نباید شناسه داخلی Tenant یا اطلاعات حساس را نمایش دهد.
- کاربران هر Vertical مستقیماً از دامنه همان Vertical وارد می‌شوند.
- `app.aradcrm.ir` مخصوص CRM عمومی و Workspaceهای فاقد Vertical تخصصی است.
- احراز هویت باید یکپارچه باشد، اما هر اپ Origin و PWA مستقل خود را حفظ کند.
- دامنه نباید محل واقعی سرور را مشخص یا به آن وابسته باشد.

---

## 8. Tenant و Workspace

مدل پایه:

```text
User
  └── Membership
        └── Organization / Workspace
              └── Vertical + Configuration
```

کاربر می‌تواند عضو یک یا چند کسب‌وکار باشد. پس از ورود:

- اگر فقط یک Workspace دارد، مستقیماً وارد همان Workspace می‌شود؛
- اگر چند Workspace دارد، Workspace Selector نمایش داده می‌شود؛
- سطح دسترسی از Membership و Role تعیین می‌شود؛
- نوع صنعت از تنظیمات Organization تعیین می‌شود، نه از Role کاربر.

در فاز اول لازم نیست برای هر مشتری ساب‌دامین جدا ایجاد شود. تمام کلینیک‌ها می‌توانند از:

```text
clinic.aradcrm.ir
```

استفاده کنند و Tenant پس از احراز هویت مشخص شود.

### 8.1 Custom Domain

معماری باید امکان Custom Domain آینده را داشته باشد:

```text
crm.customer-domain.ir
```

Custom Domain قابلیت اختیاری و مناسب پلن White-label یا مشتریان اختصاصی است. این قابلیت نباید برای MVP الزامی باشد.

---

## 9. مدل PWA

هر Vertical یک PWA مستقل است و باید حداقل موارد زیر را مستقل تعریف کند:

- App ID
- Manifest
- `name` و `short_name`
- Iconها
- Theme Color
- Background Color
- Start URL
- Scope
- Service Worker
- Cache Strategy
- Offline Behaviour
- Navigation
- Permission Requests
- Branding
- Release Version

نمونه:

```text
clinic.aradcrm.ir
PWA: Arad Clinic
Scope: /
```

```text
insurance.aradcrm.ir
PWA: Arad Insurance
Scope: /
```

```text
auto.aradcrm.ir
PWA: Arad Auto
Scope: /
```

PWAها کد، Design System و ماژول‌های مشترک را Reuse می‌کنند، اما از دید مرورگر و کاربر اپ‌های مستقل هستند.

Service Worker یک Vertical نباید Asset، Route یا Cache مربوط به Vertical دیگری را کنترل کند.

---

## 10. توپولوژی استقرار اولیه

در فاز اولیه، همه دامنه‌ها می‌توانند به یک IP یا Load Balancer اشاره کنند:

```text
DNS
  └── Reverse Proxy / Load Balancer
        ├── ops.aradcrm.ir       → Ops App
        ├── app.aradcrm.ir       → Generic CRM App
        ├── clinic.aradcrm.ir    → Clinic App
        ├── insurance.aradcrm.ir → Insurance App
        ├── auto.aradcrm.ir      → Auto App
        ├── api.aradcrm.ir       → CRM API
        └── id.aradcrm.ir        → Identity Service
```

Reverse Proxy باید بر اساس Host Header درخواست را به اپ درست هدایت کند.

ساده بودن استقرار اولیه نباید باعث شود:

- اپ‌ها یک Artifact مشترک اجباری داشته باشند؛
- تمام Frontendها از یک Runtime Bundle غیرقابل‌تفکیک سرو شوند؛
- دیتابیس محصولات مستقل Shared Table داشته باشد؛
- Verticalها مستقیماً به جداول یکدیگر متصل شوند؛
- جداسازی آینده به تغییر URL یا Rewrite گسترده نیاز داشته باشد.

---

## 11. مسیر رشد استقرار

### فاز 1 — Shared Infrastructure

- یک سرور یا Cluster کوچک
- Reverse Proxy مشترک
- Build مستقل اپ‌ها
- API و Worker مشترک CRM
- دیتابیس Multi-tenant برای مشتریان استاندارد
- Object Storage و Queue مشترک با Namespace و Access Policy مجزا

### فاز 2 — Independent Scaling

- انتقال Workerها به سرویس مستقل
- Scale مستقل API، Automation و Communication
- CDN مستقل برای PWAها
- Queueهای جدا برای پیام، Webhook و Jobهای زمان‌دار
- Read Model یا Analytics Storage مستقل در صورت نیاز واقعی

### فاز 3 — Isolated Customer Deployment

برای مشتریان حساس یا بزرگ:

- Deployment مستقل
- دیتابیس مستقل
- Storage مستقل
- Secret و کلیدهای مستقل
- Backup و Retention Policy مستقل
- دامنه یا Custom Domain اختصاصی

نسخه اختصاصی همچنان باید از همان Packageها و Pipeline استاندارد استفاده کند و Fork دستی ایجاد نشود.

---

## 12. مدل داده و System of Record

قاعده اصلی:

> هر Fact دقیقاً یک مالک دارد. سایر بخش‌ها فقط Reference یا Read Model نگهداری می‌کنند.

| داده | مالک اصلی |
|---|---|
| Lead، Opportunity، Activity و Timeline | Arad CRM‑OS |
| Role، تیم فروش، پورسانت و Next Action | Arad CRM‑OS |
| پاسخ خام فرم و Experience | Neksta |
| سفارش، سبد خرید، موجودی و Fulfillment | Arad Commerce OS |
| اشتراک و پرداخت Mizro | Mizro |
| نمای مالی مشتری و Revenue Intelligence | Arad CRM‑OS |
| ثبت رسمی بدهکار/بستانکار و مالیات | سیستم حسابداری |
| اطلاعات بالینی و درمانی | Clinic Vertical با دسترسی محافظت‌شده |

Shared Database Table میان محصولات مستقل ممنوع است. ارتباط فقط از طریق API و Event Contract انجام می‌شود.

---

## 13. ارتباط با محصولات دیگر

### 13.1 Neksta

Neksta مالک فرم، مسیر پرسشنامه و پاسخ خام است. CRM از طریق API، Webhook یا Event اطلاعات نرمال‌شده زیر را دریافت می‌کند:

- Lead
- Source
- Campaign
- Customer Insight
- Recommended Action
- Link به پاسخ کامل

### 13.2 Mizro

Mizro محصول مستقل منوی دیجیتال است. CRM برای فروش Mizro موارد زیر را مدیریت می‌کند:

- Lead کافه و رستوران
- ویزیت حضوری
- Opportunity
- دلایل خرید یا عدم خرید
- فروشنده و پورسانت
- تمدید و Upsell

اشتراک و پرداخت Mizro در Mizro ثبت می‌شود و نتیجه از طریق Event به CRM می‌رسد.

### 13.3 Arad Commerce OS

Commerce OS مالک موارد زیر است:

- Catalog
- Pricing
- Cart
- Order
- Payment
- Refund
- Inventory
- Fulfillment

CRM پس از دریافت رویداد معتبر خرید یا پرداخت، Timeline، ارزش مشتری، پورسانت، Segment و Automation را به‌روزرسانی می‌کند.

---

## 14. Automation و Communication

CRM مالک تصمیم ارتباطی است:

```text
چه کسی → چرا → چه زمانی → چه پیامی → از چه کانالی → با چه اقدام بعدی
```

مدل Flow:

```text
Trigger
→ Wait
→ Condition
→ Action
→ Delivery Result
→ Customer Response
→ Next Action / Human Task / Stop
```

`communication` مسئول اجرای فنی ارسال و دریافت است:

- SMS
- WhatsApp
- Bale
- Telegram
- Email
- Nimchat یا Providerهای مشابه

Providerها باید از طریق Adapter قابل‌تعویض متصل شوند. Automation نباید به SDK یا مدل داده یک Provider خاص وابسته باشد.

---

## 15. الزامات امنیتی

حداقل الزامات:

- Tenant Context باید در تمام درخواست‌ها به‌صورت امن Resolve شود.
- تمام Queryهای Tenant-bound باید Scope اجباری داشته باشند.
- نقش Ops نباید با نقش مدیر کسب‌وکار یکسان باشد.
- دسترسی به `ops.aradcrm.ir` محدود، ثبت‌شده و قابل Audit باشد.
- عملیات حساس دارای Audit Log باشند.
- Secretهای هر محیط و Provider خارج از سورس نگهداری شوند.
- داده پزشکی از Marketing و Sales Permission جدا شود.
- پاسخ و پیام حساس پزشکی نباید در Timeline عمومی قابل مشاهده باشد.
- Background Job باید Tenant و Permission Context معتبر داشته باشد.
- Webhookها باید امضا، Idempotency و Replay Protection داشته باشند.
- Backup و Restore باید در سطح Tenant یا Deployment قابل برنامه‌ریزی باشد.
- Custom Domain نباید باعث دور زدن سیاست Auth، CORS یا Tenant Isolation شود.

---

## 16. CI/CD و محیط‌ها

حداقل محیط‌های پیشنهادی:

```text
local
development
staging
production
```

Pipeline هر اپ باید شامل موارد زیر باشد:

1. Install با Lockfile ثابت
2. Lint و Static Check
3. Unit Test
4. Contract Test
5. Build اپ هدف
6. Migration Safety Check
7. Artifact/Image Versioning
8. Deployment
9. Health Check
10. Smoke Test دامنه همان اپ
11. Rollback Strategy

هر Release باید مشخص کند:

- کدام اپ‌ها تغییر کرده‌اند؛
- کدام Packageهای مشترک تغییر کرده‌اند؛
- آیا Migration دارد؛
- آیا Event Contract تغییر کرده است؛
- آیا PWA Cache Version باید افزایش پیدا کند.

تغییر Event Contract باید Additive و Backward-compatible باشد، مگر اینکه برنامه Migration رسمی تصویب شود.

---

## 17. موارد غیرهدف

موارد زیر در این مرحله هدف نیستند:

- ساخت ERP عمومی
- ساخت حسابداری رسمی
- ساخت یک UI واحد برای تمام صنایع
- ایجاد Fork برای هر مشتری
- خرید دامنه مستقل برای هر Vertical
- ساخت اپ Native مجزا پیش از اثبات نیاز PWA
- استخراج زودهنگام تمام Packageها به Microservice
- پیاده‌سازی White-label کامل در MVP
- ساخت هم‌زمان تمام Verticalهای ممکن

معماری باید برای رشد آماده باشد، اما توسعه هر Vertical فقط با نیاز واقعی و اعتبارسنجی بازار انجام می‌شود.

---

## 18. چک‌لیست پذیرش معماری

پیش از شروع توسعه گسترده، تیم باید بتواند به تمام پرسش‌های زیر پاسخ مثبت دهد:

- [ ] آیا هر Vertical یک App مستقل دارد؟
- [ ] آیا هر App می‌تواند مستقل Build شود؟
- [ ] آیا هر App می‌تواند بدون تغییر URL روی سرور دیگری Deploy شود؟
- [ ] آیا Core هیچ وابستگی مستقیمی به Clinic، Insurance یا Auto ندارد؟
- [ ] آیا Business Ruleهای صنعتی فقط در Vertical Package قرار گرفته‌اند؟
- [ ] آیا PWA هر صنعت Manifest و Service Worker مستقل دارد؟
- [ ] آیا Tenant Context در API، Job و Webhook اجباری است؟
- [ ] آیا `ops` از پنل مشتری و نقش‌های Tenant جداست؟
- [ ] آیا هیچ Shared Table میان CRM، Neksta، Mizro و Commerce وجود ندارد؟
- [ ] آیا System of Record هر Entity مشخص است؟
- [ ] آیا Automation از Provider پیام‌رسان مستقل است؟
- [ ] آیا داده بالینی از CRM عمومی و تیم فروش جدا شده است؟
- [ ] آیا تغییر Package مشترک فقط اپ‌های وابسته را Build می‌کند؟
- [ ] آیا Migration، Rollback و PWA Cache Update در Pipeline دیده شده است؟
- [ ] آیا امکان Deployment اختصاصی بدون Fork کد وجود دارد؟

---

## 19. تصمیم نهایی

ساختار مبنا:

```text
aradcrm.ir             → Product Website

ops.aradcrm.ir         → Arad Control Plane
app.aradcrm.ir         → Generic CRM PWA
clinic.aradcrm.ir      → Clinic PWA
insurance.aradcrm.ir   → Insurance PWA
auto.aradcrm.ir        → Auto Service PWA

api.aradcrm.ir         → CRM API Gateway
id.aradcrm.ir          → Central Identity
```

همه اپ‌ها در Monorepo `arad-crm-os` توسعه داده می‌شوند، اما Application، Build، PWA و Deployment مستقل دارند. استقرار اولیه می‌تواند روی یک سرور مشترک انجام شود، ولی مرزهای کد، داده، دامنه و Pipeline باید از روز اول امکان جداسازی آینده را حفظ کنند.

---

## 20. مواردی که CTO باید در ADRهای جداگانه تعیین کند

این سند مرزها را مشخص می‌کند، اما تصمیم‌های زیر باید توسط CTO در ADRهای فنی ثبت شوند:

- ابزار Monorepo و Package Management
- فریم‌ورک Frontend و Backend
- روش Auth/SSO بین Originها
- نوع دیتابیس و مدل Tenant Isolation
- Job Queue و Scheduler
- Event Transport
- Migration Strategy
- Deployment Platform
- Observability Stack
- Secret Management
- Backup و Disaster Recovery
- روش Feature Flag و Configuration
- سیاست Versioning Packageها و Event Contractها
- سیاست Offline و Cache برای هر PWA

هر ADR باید با تصمیم‌های قفل‌شده این سند سازگار باشد.
