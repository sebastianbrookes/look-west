import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "alerts"))

from email_renderer import render_email_html


class RenderEmailHtmlTests(unittest.TestCase):
    def test_render_email_html_escapes_untrusted_values(self):
        html = render_email_html(
            message='<img src=x onerror="alert(1)"> Sunset <b>now</b>',
            location='Santa Cruz<script>alert("x")</script>',
            sunset_time='7:42 PM & soon',
            unsubscribe_url='https://example.com/unsubscribe?user="abc"&next=<bad>',
        )

        self.assertNotIn('<img src=x onerror="alert(1)">', html)
        self.assertNotIn('<script>alert("x")</script>', html)
        self.assertIn(
            '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; Sunset &lt;b&gt;now&lt;/b&gt;',
            html,
        )
        self.assertIn('Santa Cruz&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', html)
        self.assertIn('7:42 PM &amp; soon', html)
        self.assertIn(
            'href="https://example.com/unsubscribe?user=&quot;abc&quot;&amp;next=&lt;bad&gt;"',
            html,
        )


if __name__ == "__main__":
    unittest.main()
