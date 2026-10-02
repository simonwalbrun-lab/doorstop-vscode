%setdefault('stylesheet', None)
<!DOCTYPE html>
<html lang="en">
<head>
<title>{{!doc_attributes["name"]}}</title>
<meta charset="utf-8" />
<meta http-equiv="content-type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
% if is_doc:
%   tmpRef='../'
% else:
%   tmpRef=''
% end
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;700;800&family=IBM+Plex+Serif:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
{{! '<link type="text/css" rel="stylesheet" href="%s" />'%(baseurl+tmpRef+'template/'+stylesheet) if stylesheet else "" }}
<!-- MathJax 3, loaded locally so item text with inline/display math ($...$, $$...$$) still renders offline. -->
<script src="{{baseurl}}{{tmpRef}}template/tex-mml-chtml.js" id="MathJax-script" async></script>
<script>
  MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']]
    },
    svg: {
      fontCache: 'global'
    }
  };
</script>
</head>
<body>
{{!base}}
</body>
</html>
