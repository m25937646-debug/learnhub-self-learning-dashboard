# LearnHub — Design direction

## Direction
**Professional learning cockpit — لوحة تعلم هادئة ومركّزة**

LearnHub should feel like a premium personal learning workspace: calm enough for deep work, distinctive enough to feel authored, and structured enough that progress is always visible without becoming noisy.

## Design movement
Editorial dashboard meets modern productivity software: generous breathing room, layered surfaces, crisp typography, and a restrained luminous accent system instead of generic glassmorphism.

## Core principles
- **Focus first:** the current task and next action should be visually obvious.
- **Calm hierarchy:** background, surface, elevated card, and active state each have a distinct visual role.
- **Evidence of progress:** progress, streaks, deadlines, and saved work use clear visual signals.
- **One signature moment:** a subtle aurora-grid background and teal-to-violet progress language make the product memorable without distracting from study.
- **Accessible contrast:** Arabic text remains highly legible in dark mode, with light mode preserved as a deliberate alternative.

## Color philosophy
- Deep ink/navy base instead of flat black: `#08111F` and `#0D1B2A`.
- Warm paper-white text: `#F4F7FB`, with cool slate supporting text.
- Signature mint-teal for action and progress: `#44E0C2`.
- Electric violet for planning and reflection: `#9B8AFB`.
- Warm amber for deadlines and highlights: `#F3C969`.
- Use gradients sparingly as directional light, never as noisy decoration.

## Layout paradigm
- A persistent compact navigation rail on desktop and a bottom navigation dock on mobile.
- A clean content column with a clear page title and short explanatory subtitle.
- Hero blocks become purposeful: one headline, one metric or action, no duplicated decoration.
- Cards use 18–22px radii, consistent 1px borders, and a small elevation vocabulary.

## Signature elements
- Aurora grid: low-opacity radial light plus a fine grid texture in the app shell.
- “Signal cards”: thin top accent, icon badge, eyebrow label, and one strong value.
- A consistent active underline/pill for navigation and tabs.
- Soft focus rings and hover lift for interactive cards.

## Interaction philosophy
Interactions should feel immediate and reversible. Buttons should read as actions, cards as destinations, and status messages as quiet confirmations. Preserve autosave, login, file upload, and file-opening behavior while making state changes easier to scan.

## Animation
Use short 160–220ms transitions for hover, focus, tab changes, and progress updates. Avoid perpetual motion except for the background glow; it should remain nearly imperceptible.

## Typography system
Keep Cairo for headings and Tajawal for body copy. Increase heading contrast, reduce excessive tiny text, and use a consistent scale: 12px metadata, 14–16px body, 18–22px card titles, 30–40px page hero.

## Brand essence and voice
Warm, disciplined, practical, optimistic. The interface speaks like a calm coach: direct labels, short guidance, and visible next steps.

## Wordmark/logo
Retain the existing LearnHub identity and icons. Strengthen the wordmark treatment through spacing, a compact brand lockup in the header, and a mint-violet signal mark rather than introducing a competing image asset.

## Signature brand color
`#44E0C2` — “learning signal” mint.

## Scope note
This is an existing functional dashboard. No new generated imagery is required; the redesign is carried by the layout system, background treatment, typography, cards, navigation, and state styling.

## ملاحظة تجربة رفع ومعاينة الملفات
تظهر أزرار الرفع في أقسام المرفقات والمرئيات والبطاقات التعليمية والمشروع والتجربة العكسية. يقبل كل زر الملفات متعددة الأنواع بلا تقييد امتداد، ويعرض تقدّم الرفع ورسالة نجاح. تفتح الملفات من بطاقاتها في تبويب معاينة آمن يحمل اسم الملف ونوعه؛ الأنواع الشائعة تُعرض بمشغّلات المتصفح، أما الملفات الأخرى فتظهر معاينة تقنية آمنة للنص أو للبايتات الأولية مع بيانات الملف، دون تنزيل أو تشغيل محتوى نشط أو إرسال الملف إلى خدمة خارجية.

يظل رفع الملف ظاهرًا ويستمر حتى اكتماله عند الانتقال بين تبويبات وصفحات LearnHub، ثم يُحفظ الملف في القسم والعنوان اللذين بدأ منهما الرفع.


يُحذف تبويب البطاقات من خطوات العنوان ولا يدخل في حساب إنجازها، مع الاحتفاظ ببيانات البطاقات القديمة دون حذفها.


داخل المسار، تُعرض مساحة المسار وحدها دون مخططي الشهر/الأسبوع أو شريط المسارات الأخرى أو عناصر الرئيسية؛ وتبقى وسيلة رجوع واضحة متاحة من صفحات المسار والعناوين.
